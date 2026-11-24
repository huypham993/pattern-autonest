"""Units, Bézier flattening, fill rules, offsets – and verification of the
geometry libraries' behaviour on concave polygons and holes (we do not assume
Shapely/Clipper handle them; we check)."""
import math

import pytest
from shapely.geometry import Point, Polygon

from autonest import regions
from autonest.bezier import flatten_cubic, flatten_path
from autonest.rotation import candidate_angles, candidate_orientations, grain_angles
from autonest.units import MM_PER_PT, SheetFrame, mm_to_pt, pt_to_mm


# ------------------------------------------------------------------ units
def test_pt_mm_exact():
    assert pt_to_mm(72.0) == pytest.approx(25.4, abs=1e-12)
    assert mm_to_pt(25.4) == pytest.approx(72.0, abs=1e-12)
    assert MM_PER_PT == pytest.approx(0.35277777777, rel=1e-10)


def test_offset_artboard_frame_roundtrip():
    f = SheetFrame.from_artboard_rect([-12345.678, 8765.4321, -12345.678 + 900 * 72 / 25.4,
                                       8765.4321 - 600 * 72 / 25.4])
    assert f.width_mm == pytest.approx(900, abs=1e-9)
    assert f.height_mm == pytest.approx(600, abs=1e-9)
    assert f.to_mm(-12345.678, 8765.4321 - 600 * 72 / 25.4) == pytest.approx((0, 0), abs=1e-9)
    x, y = f.to_pt(123.4, 56.7)
    assert f.to_mm(x, y) == pytest.approx((123.4, 56.7), abs=1e-9)


def test_y_down_rejected():
    with pytest.raises(ValueError):
        SheetFrame.from_artboard_rect([0, 0, 100, -100], y_axis="down")


# ---------------------------------------------------------------- bezier
def _circle_rows(r):
    k = 0.5522847498 * r
    return [[r, 0, r, -k, r, k], [0, r, k, r, -k, r], [-r, 0, -r, k, -r, -k], [0, -r, -k, -r, k, -r]]


@pytest.mark.parametrize("tol", [1.0, 0.25, 0.05, 0.01])
def test_flatten_respects_tolerance(tol):
    """Every chord of the flattened polyline stays within tol of the exact cubic."""
    r = 100.0
    rows = _circle_rows(r)
    poly = flatten_path(rows, True, tol)
    # sample the true Bézier densely and measure distance to the polyline
    from shapely.geometry import LinearRing
    ring = LinearRing(poly)
    worst = 0.0
    for i in range(4):
        a, b = rows[i], rows[(i + 1) % 4]
        p0, p1, p2, p3 = (a[0], a[1]), (a[4], a[5]), (b[2], b[3]), (b[0], b[1])
        for s in range(201):
            t = s / 200
            u = 1 - t
            x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
            y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
            worst = max(worst, ring.distance(Point(x, y)))
    assert worst <= tol + 1e-9


def test_flatten_adaptive_vertex_count():
    rows = _circle_rows(100)
    n = [len(flatten_path(rows, True, t)) for t in (1.0, 0.25, 0.05)]
    assert n[0] < n[1] < n[2]
    # straight edges never get subdivided
    sq = [[0, 0, 0, 0, 0, 0], [10, 0, 10, 0, 10, 0], [10, 10, 10, 10, 10, 10], [0, 10, 0, 10, 0, 10]]
    assert len(flatten_path(sq, True, 0.001)) == 4


def test_flatten_degenerate_cubic_loop():
    out = []
    flatten_cubic((0, 0), (10, 10), (-10, 10), (0, 0), 0.1, out)  # closed loop cubic
    assert len(out) > 4 and out[-1] == (0, 0)


# ------------------------------------------------------------- fill rules
BOWTIE = [(0, 0), (10, 10), (10, 0), (0, 10)]
PENTAGRAM = [(math.cos(math.pi / 2 + i * 4 * math.pi / 5), math.sin(math.pi / 2 + i * 4 * math.pi / 5))
             for i in range(5)]


def test_bowtie_region():
    r = regions.region_from_rings([BOWTIE])
    assert r.area == pytest.approx(50.0, rel=1e-6)
    assert len(r.geoms) == 2


def test_pentagram_nonzero_vs_evenodd():
    nz = regions.region_from_rings([[(x * 100, y * 100) for x, y in PENTAGRAM]], "nonzero")
    eo = regions.region_from_rings([[(x * 100, y * 100) for x, y in PENTAGRAM]], "evenodd")
    assert nz.area > eo.area
    assert len(nz.geoms) == 1 and len(nz.geoms[0].interiors) == 0
    # even-odd leaves the inner pentagon unpainted: 5 triangles touching at vertices
    ri = 100 * math.cos(math.radians(72)) / math.cos(math.radians(36))
    pentagon = 2.5 * ri * ri * math.sin(math.radians(72))
    assert eo.area == pytest.approx(nz.area - pentagon, rel=1e-6)


def test_compound_hole_by_direction():
    outer = [(0, 0), (100, 0), (100, 100), (0, 100)]
    inner_same = [(25, 25), (75, 25), (75, 75), (25, 75)]
    inner_rev = inner_same[::-1]
    assert regions.region_from_rings([outer, inner_rev], "nonzero").area == pytest.approx(7500)
    assert regions.region_from_rings([outer, inner_same], "nonzero").area == pytest.approx(10000)
    assert regions.region_from_rings([outer, inner_same], "evenodd").area == pytest.approx(7500)


def test_island_inside_hole_kept():
    rings = [[(0, 0), (100, 0), (100, 100), (0, 100)],
             [(20, 20), (80, 20), (80, 80), (20, 80)],
             [(40, 40), (60, 40), (60, 60), (40, 60)]]
    r = regions.region_from_rings(rings, "evenodd")
    assert r.area == pytest.approx(10000 - 3600 + 400)
    assert len(r.geoms) == 2


# ----------------------------------------------------- library verification
def test_shapely_concave_and_holes_behaviour():
    U = Polygon([(0, 0), (30, 0), (30, 30), (20, 30), (20, 10), (10, 10), (10, 30), (0, 30)])
    peg = Polygon([(12, 15), (18, 15), (18, 40), (12, 40)])  # sits in the U's pocket
    assert U.is_valid and not U.intersects(peg.buffer(-1.0)) and U.distance(peg) == pytest.approx(2.0)
    ring = Polygon([(0, 0), (50, 0), (50, 50), (0, 50)], [[(10, 10), (40, 10), (40, 40), (10, 40)]])
    inner = Polygon([(15, 15), (35, 15), (35, 35), (15, 35)])
    assert not ring.intersects(inner) and ring.distance(inner) == pytest.approx(5.0)
    grown = regions.safe_offset(ring, 2.0)
    assert grown.geoms[0].interiors and Polygon(grown.geoms[0].interiors[0]).area < 900  # hole shrinks
    assert (U.union(peg)).area == pytest.approx(U.area + peg.area)


def test_pyclipper_concave_union():
    U = [(0, 0), (30, 0), (30, 30), (20, 30), (20, 10), (10, 10), (10, 30), (0, 30)]
    r = regions.region_from_rings([U, [(5, 5), (25, 5), (25, 8), (5, 8)]])
    assert r.area == pytest.approx(Polygon(U).area)


# ---------------------------------------------------------------- offsets
def test_safe_offset_contains_true_disk():
    p = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    d = 2.5
    off = regions.safe_offset(p, d)
    for k in range(360):
        a = math.radians(k + 0.5)
        corner = (10 + d * math.cos(a), 10 + d * math.sin(a))
        if corner[0] >= 10 and corner[1] >= 10:
            assert off.buffer(1e-9).covers(Point(corner))


def test_spacing_guarantee_concave_pair():
    """Two parts whose s/2 offsets just touch keep a real gap >= s."""
    s = 5.0
    A = Polygon([(0, 0), (60, 0), (60, 60), (40, 60), (40, 20), (20, 20), (20, 60), (0, 60)])
    B = Polygon([(25, 25), (35, 25), (35, 80), (25, 80)])
    oa = regions.safe_offset(A, s / 2)
    ob = regions.safe_offset(B, s / 2)
    # push B down until offsets touch (bisection on vertical translation)
    from shapely.affinity import translate
    lo, hi = 0.0, 30.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if oa.intersects(translate(ob, 0, -mid)):
            hi = mid
        else:
            lo = mid
    Bt = translate(B, 0, -lo)
    assert A.distance(Bt) >= s - 1e-6


def test_stroke_region_round_and_miter():
    line = [(0, 0), (50, 0), (50, 50)]
    r = regions.stroke_region(line, False, 4, "round", "round")
    assert r.area == pytest.approx(100 * 4 + math.pi * 4, rel=0.03)
    m = regions.stroke_region([(0, 0), (40, 0), (40, 40), (0, 40)], True, 4, "miter", "butt", 10)
    assert m.bounds == pytest.approx((-2, -2, 42, 42), abs=1e-6)


# ---------------------------------------------------------------- rotation
def test_rotation_presets():
    assert candidate_angles({"preset": "fixed"}) == [0.0]
    assert candidate_angles({"preset": "0_180"}) == [0.0, 180.0]
    assert candidate_angles({"preset": "0_90_180_270"}) == [0.0, 90.0, 270.0, 180.0]
    a5 = candidate_angles({"preset": "step", "step_deg": 5})
    assert len(a5) == 72 and a5[:3] == [0.0, 5.0, 355.0]
    assert len(candidate_angles({"preset": "step", "step_deg": 1})) == 360
    assert len(candidate_angles({"preset": "step", "step_deg": 15})) == 24
    assert len(candidate_angles({"preset": "step", "step_deg": 7})) == 51  # custom step


def test_rotation_limits_grain_mirror():
    lim = candidate_angles({"preset": "step", "step_deg": 5, "allow_full_360": False, "max_abs_deg": 10})
    assert sorted(lim) == [0.0, 5.0, 10.0, 350.0, 355.0]
    assert candidate_angles({"preset": "step", "step_deg": 5, "grain_lock": True}) == [0.0, 180.0]
    assert candidate_angles({"preset": "0_90_180_270", "grain_lock": True}) == [0.0, 180.0]
    o = candidate_orientations({"preset": "0_180", "allow_mirror": True})
    assert [(x.angle_deg, x.mirror) for x in o] == [(0.0, False), (180.0, False), (0.0, True), (180.0, True)]
    assert candidate_angles({"preset": "custom", "custom_angles_deg": [-30, 30, 390]}) == [30.0, 330.0]


def test_grain_angles():
    assert grain_angles(0, 1) == [0.0, 180.0]
    a = candidate_angles({"preset": "custom", "custom_angles_deg": grain_angles(3, 1)})
    assert a[:3] == [0.0, 1.0, 359.0] and len(a) == 14
    assert {round(x) for x in a} == {0, 1, 2, 3, 357, 358, 359, 177, 178, 179, 180, 181, 182, 183}
    assert len(grain_angles(5, 2)) == 10            # 0, +-2, +-4 around 0 and 180
    with pytest.raises(ValueError):
        grain_angles(95, 1)
