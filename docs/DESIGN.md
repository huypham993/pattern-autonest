# Illustrator True-Shape Auto Nesting — Thiết kế kỹ thuật (Phase 1, cập nhật Phase 3A)

Phiên bản tài liệu: 0.2 (kèm mã Phase 2) · Môi trường đích: Windows 11, Adobe Illustrator 2025/2026

Ký hiệu độ tin cậy dùng trong tài liệu:
**[ĐÃ TEST]** đã chạy test thật trong repo này · **[MOCK]** đã chạy code JSX thật nhưng trên DOM giả lập (Node) ·
**[CẦN KIỂM CHỨNG]** hành vi của Illustrator thật, chưa chạy được trong môi trường phát triển (Linux, không có Illustrator).

---

## 1. Mục tiêu và nguyên tắc

Sắp xếp các **GroupItem được chọn** vào artboard (hoặc cuộn vải khổ cố định) dựa trên **đường bao hình học thật**
của từng Group, chỉ bằng **xoay + tịnh tiến** cả Group, không đụng tới artwork bên trong.

Nguyên tắc thiết kế xuyên suốt:

1. **Bounding box không bao giờ là hình học nesting.** AABB chỉ dùng cho broad-phase và cho phép thử “có vừa
   khung chữ nhật không” (phép thử này *chính xác* với container hình chữ nhật: một hình nằm trong hình chữ nhật
   trục-song-song khi và chỉ khi AABB của nó nằm trong đó).
2. **An toàn hơn tiết kiệm.** Mọi xấp xỉ đều là xấp xỉ *ra ngoài* (conservative): làm phẳng Bézier rồi nới
   thêm đúng bằng tolerance; offset cung tròn dùng đa giác *ngoại tiếp*; mitre bị giới hạn được cắt vuông ở
   giới hạn (lớn hơn bevel thật). Nhờ vậy khoảng cách thực giữa các đường cong Bézier gốc luôn ≥ spacing.
3. **Không im lặng.** Khi không xác định được silhouette (raster, text, hiệu ứng…) thì báo lỗi và yêu cầu
   `NEST_OUTLINE`, không lặng lẽ dùng bounding box (chỉ dùng khi người dùng bật `opaque_policy = use_bounds`).
   Mặc định từ v0.3.2 là `opaque_policy = cut_line`: nếu Group có ảnh và một đường cắt (path đóng, có stroke, không fill)
   thì dùng đường cắt đó, kèm cảnh báo cho biết ảnh tràn ra ngoài bao nhiêu mm; không có đường cắt thì vẫn báo lỗi.
4. **Không thay đổi tài liệu trước khi người dùng bấm Apply.** Export chỉ đọc DOM.
5. **Engine tách khỏi Illustrator.** Toàn bộ hình học phức tạp nằm trong Python; JSX chỉ đọc/ghi và biến đổi.

## 2. Kiến trúc

```
 ┌──────────────── Illustrator (ExtendScript, ES3) ────────────────┐
 │ Illustrator_AutoNesting.jsx                                     │
 │   lib/an_extract.jsxinc  đọc selection + artboard (read-only)   │──► geometry.json   (autonest.geometry/1)
 │   lib/an_json.jsxinc     JSON encode/decode (ES3 không có JSON) │
 │   lib/an_apply.jsxinc    [Phase 4] xoay/dịch + kiểm tra + rollback ◄── placement.json (autonest.placement/1)
 │   UI ScriptUI            [Phase 4]                              │
 └─────────────────────────────────────────────────────────────────┘
                 │ geometry.json                       ▲ placement.json, preview.png/svg
                 ▼                                     │
 ┌──────────────── Python engine (Python 3.10+, Shapely/GEOS, pyclipper) ─────────┐
 │ nest_engine.py  analyze | nest                                                  │
 │ autonest/contract.py   kiểm tra cấu trúc JSON, giá trị mặc định                  │
 │ autonest/units.py      pt ↔ mm, sheet frame (gốc = góc dưới-trái artboard)       │
 │ autonest/bezier.py     adaptive flattening có chặn sai số                        │
 │ autonest/regions.py    fill rule (Clipper), stroke, offset an toàn (GEOS)        │
 │ autonest/silhouette.py ưu tiên NEST_OUTLINE → clipping → hợp vector             │
 │ autonest/analyze.py    validation, envelope, kiểm tra vừa khổ theo góc xoay      │
 │ autonest/rotation.py   tập góc xoay                                              │
 │ autonest/transform.py  quy ước ma trận dùng chung với JSX                        │
 │ autonest/nfp.py, place.py, optimize.py, verify.py, baseline.py   [Phase 3]       │
 └─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Cách chạy engine từ Illustrator trên Windows

| Cách | Đánh giá |
|---|---|
| `system.callSystem()` | **Không dùng.** Đây là API của After Effects; ExtendScript của Illustrator không có hàm tương đương trả về stdout/exit code. |
| Node.js trong ExtendScript | **Không có.** ExtendScript là engine ES3 riêng. |
| `File.execute()` | Mở file bằng ứng dụng được gán (như double-click), **bất đồng bộ**, không có exit code/stdout, có thể bị chính sách bảo mật hoặc file association (`.cmd` mở bằng Notepad) chặn. Dùng được cho one-click *thử nghiệm*: JSX ghi `geometry.json` + `run.cmd`, gọi `File(run.cmd).execute()`, rồi chờ file `done.json`/`error.json` bằng vòng lặp `$.sleep()` có timeout và nút Hủy. **[CẦN KIỂM CHỨNG]** |
| CEP panel (HTML + Node `child_process`) | Đáng tin cậy nhất cho one-click (spawn Python, đọc stdout, progress). CEP vẫn chạy trên Illustrator 2025 nhưng Adobe đang chuyển sang UXP; cần chữ ký/PlayerDebugMode. Kế hoạch nâng cấp sau Phase 5. |

**Quyết định:** workflow chính là 3 bước hiển thị rõ ràng — **Export (JSX) → Run Nesting (Python, `.cmd` kéo-thả) →
Apply (JSX)**. One-click qua `File.execute()` là tùy chọn thử nghiệm ở Phase 4, luôn có đường lui về 3 bước. Engine
là CLI thuần (`stdin/stdout`/file), nên một CEP panel sau này chỉ cần gọi lại cùng CLI, không viết lại engine.

## 3. Giới hạn của Illustrator Scripting API và cách xử lý

| # | Giới hạn | Xử lý trong thiết kế |
|---|---|---|
| 1 | ExtendScript = ES3, chậm khi lặp nhiều; không có `JSON`, `Array.indexOf/forEach`, `String.trim`. | JSON encoder/parser riêng (không `eval`) **[MOCK]**; kiểm tra cú pháp ES3 bằng acorn `ecmaVersion: 3` và chặn API ES5 **[ĐÃ TEST]**. Mỗi PathPoint chỉ đọc một lần. |
| 2 | Không có phép boolean/offset hình học trong bộ nhớ. Pathfinder/Offset Path/Outline Stroke/Expand chỉ chạy trên đối tượng thật (phá hủy, thay đổi tài liệu). | Không dùng. Xuất dữ liệu Bézier thô; mọi phép hợp/offset làm trong Python. |
| 3 | `app.coordinateSystem` ảnh hưởng `artboardRect`/`position`; tọa độ scripting có trục y hướng lên, gốc là ruler origin của tài liệu. | JSX đặt `DOCUMENTCOORDINATESYSTEM` trong lúc đọc rồi khôi phục; ghi `y_axis` suy ra từ chính `artboardRect` (top > bottom ⇒ y hướng lên). Python đối chiếu bounds tự tính với `geometricBounds` của Illustrator: lệch > 25 mm ⇒ lỗi `COORDINATE_MISMATCH`, không xếp. **[CẦN KIỂM CHỨNG]** rằng `pathPoint.anchor` và `artboardRect` dùng chung hệ tọa độ ở chế độ này. |
| 4 | Appearance không đọc được: live effects (drop shadow, offset path), brush, variable width, graphic style, **căn stroke trong/ngoài**, opacity mask. | So `visibleBounds` của path/Group với hình học tự tính: stroke vượt ⇒ giả định stroke căn ngoài (dùng đủ độ dày) + cảnh báo; Group vượt ⇒ `APPEARANCE_EXCEEDS_GEOMETRY`, khuyên thêm `NEST_OUTLINE`. |
| 5 | Độ trong suốt của raster/placed image không truy cập được. | Raster/placed/text/symbol/mesh/plugin = *opaque*. Chỉ chấp nhận khi nằm trong clipping path hoặc chứng minh được nằm trọn trong vùng vector; nếu không ⇒ `NEEDS_NEST_OUTLINE`. |
| 6 | Text dùng làm clipping mask; compound path tạo từ group có thể không liệt kê hết qua `pathItems`. | `CLIP_PATH_UNSUPPORTED` (lỗi); `COMPOUND_INCOMPLETE` khi bounds compound ≠ tổng subpath. |
| 7 | ID ổn định: `PageItem.uuid` và `Document.getPageItemFromUuid()` chỉ có ở các bản Illustrator gần đây. | Export đọc `uuid` an toàn (try/catch). Apply tìm Group theo uuid; nếu không có, theo vị trí trong selection + *fingerprint* (geometricBounds, số phần tử). Nếu Group đã bị di chuyển sau Export ⇒ từ chối Apply. **[CẦN KIỂM CHỨNG]** |
| 8 | `rotate()`/`transform()` dùng các điểm gốc (`Transformation.CENTER`, `DOCUMENTORIGIN`…) mà quy ước chính xác khó đảm bảo, đặc biệt với clipping group. | Không phụ thuộc pivot nội bộ: Apply xoay đúng góc, sau đó đọc lại 2 **tracker anchor** đã ghi lúc Export, tính độ lệch so với vị trí kỳ vọng `M·anchor` và `translate()` bù; kiểm tra lại cả góc (vector giữa 2 tracker) với dung sai 0.01 pt. |
| 9 | Undo của script không được đảm bảo là một bước. | Rollback chủ động: lưu ma trận đã áp cho từng Group; khi lỗi, áp ma trận nghịch đảo theo thứ tự ngược và kiểm tra tracker trở về vị trí cũ. |
| 10 | Đối tượng bị khóa bên trong Group có thể không di chuyển cùng Group. | `LOCKED_CHILD` (lỗi) ngay từ bước phân tích. |
| 11 | Selection có thể là `TextRange` (đang sửa text), phần tử con (Direct Selection), group lồng nhau. | Chỉ nhận `GroupItem` cấp selection; phần còn lại vào `skipped_selection` với lý do; group nằm trong group đã chọn bị bỏ qua. |
| 12 | Preview vẽ lên tài liệu là thay đổi tài liệu. | Preview mặc định là ảnh PNG/SVG do engine tạo, hiển thị trong dialog — tài liệu không đổi. Preview trên layer tạm là tùy chọn. |

## 4. Hệ tọa độ và đơn vị

* Illustrator → JSON: điểm (pt), hệ tọa độ tài liệu, y hướng lên, giữ nguyên số liệu (làm tròn 1e-4 pt).
* Engine: **mm**, *sheet frame* — gốc tại **góc dưới-trái artboard**, x sang phải, y lên trên.
  `x_mm = (x_pt − left)·25.4/72`, `y_mm = (y_pt − bottom)·25.4/72`. Vì cùng chiều với Illustrator (không phản xạ),
  góc xoay ngược chiều kim đồng hồ có cùng nghĩa ở cả hai phía. Artboard đặt ở tọa độ âm/lớn được xử lý chính xác
  **[ĐÃ TEST]** (fixture 08: artboard tại (−12345.678, 8765.4321) pt).
* Placement trả về theo **điểm của tài liệu** (không phải mm), để JSX áp dụng trực tiếp.

## 5. Trích xuất silhouette (Phase 2)

Thứ tự ưu tiên cho mỗi Group:

1. **`NEST_OUTLINE`**: closed path/compound path tên `NEST_OUTLINE` ở bất kỳ cấp nào (nhiều cái ⇒ hợp lại; được
   phép ẩn, không fill). Phải đóng, không tự giao, không suy biến; nếu vùng vector nhìn thấy được nằm ngoài
   outline ⇒ cảnh báo `OUTLINE_SMALLER_THAN_ARTWORK`.
2. **Clipping path** của Group: vùng clip (fill rule của path) ∩ vùng nội dung nếu toàn bộ nội dung là vector;
   nếu nội dung có raster/text ⇒ dùng nguyên vùng clip (an toàn).
3. **Hợp các vùng vector được in**: fill (theo nonzero/even-odd như Illustrator; path mở có fill được đóng ngầm
   như Illustrator), stroke (buffer với join/cap/miter limit), compound path giữ lỗ, nested group, nested clip
   group (đóng góp `clip ∩ nội dung`), nhiều phần rời nhau.

Bỏ qua: guide, path không fill & không stroke (đường kỹ thuật), đối tượng ẩn, opacity 0, NEST_OUTLINE (khỏi phần hợp).

**Làm phẳng Bézier**: chia đôi de Casteljau đến khi hai điểm điều khiển cách dây cung ≤ tolerance. Vì đường cong nằm
trong bao lồi của 4 điểm điều khiển, sai số Hausdorff ≤ tolerance được *bảo đảm* (đã kiểm chứng bằng lấy mẫu dày
**[ĐÃ TEST]**). Khi `conservative_curves = true`, silhouette được nới thêm đúng tolerance ⇒ *envelope* chứa đường cong thật.

**Offset an toàn**: GEOS xấp xỉ cung tròn bằng dây cung *nội tiếp*; bán kính được nhân `1/cos(π/(4·quad_segs))` để đa giác
*ngoại tiếp* cung ⇒ vùng offset luôn chứa tổng Minkowski chính xác với đĩa tròn **[ĐÃ TEST]**.

### 5.1 Mã chẩn đoán

| Mức | Mã |
|---|---|
| error (không xếp mảnh) | `NEEDS_NEST_OUTLINE`, `OUTLINE_NOT_CLOSED`, `OUTLINE_SELF_INTERSECTION`, `OUTLINE_DEGENERATE`, `BAD_COORDINATES`, `EMPTY_SILHOUETTE`, `LOCKED_CHILD`, `COORDINATE_MISMATCH`, `CLIP_PATH_UNSUPPORTED`, `PART_TOO_LARGE`, `MARGIN_TOO_LARGE` (toàn cục) |
| warning | `SELF_INTERSECTION` (vùng tô theo fill rule), `OPEN_FILLED_PATH`, `OUTLINE_SMALLER_THAN_ARTWORK`, `APPEARANCE_EXCEEDS_GEOMETRY`, `STROKE_ALIGNMENT_ASSUMED_OUTSIDE`, `BOUNDS_MISMATCH`, `COMPOUND_INCOMPLETE`, `OPAQUE_BOUNDS_USED`, `CLIP_PATH_MISSING`, `EMPTY_CLIP`, `OUTLINE_NAME_CASE`, `LAYER_NOT_PRINTABLE`, `NESTED_SELECTION`, `UNKNOWN_ITEM_TYPE`, `TOTAL_AREA_EXCEEDS_SHEET` (toàn cục) |
| info | `HAS_HOLES`, `MULTIPLE_ISLANDS`, `OPAQUE_COVERED`, `CLIP_BOUNDS_OPAQUE_CONTENT`, `GUIDE_IGNORED`, `INVISIBLE_PATH_IGNORED`, `HIDDEN_IGNORED`, `DEGENERATE_FILL`, `STRAY_POINT`, `EMPTY_PATH`, `OPEN_PATH_COINCIDENT_ENDS`, `OPEN_CLIP_PATH`, `FITS_ONLY_SOME_ORIENTATIONS` |

## 6. JSON contract

Ba tài liệu, mỗi tài liệu có trường `schema` mang phiên bản; JSON Schema draft-07 trong `schema/`.
Thay đổi không tương thích ⇒ tăng số phiên bản (`/2`). Mã hóa UTF-8 (chấp nhận BOM).

### 6.1 `autonest.geometry/1` (Illustrator → engine) — `schema/geometry.schema.json`

```jsonc
{
  "schema": "autonest.geometry/1",
  "generator": {"name": "Illustrator_AutoNesting.jsx", "version": "0.2.0", "illustrator_version": "29.x", "exported_at": "..."},
  "document": {"name": "job.ai", "path": "C:\\...\\job.ai", "ruler_units": "Millimeters", "color_space": "CMYK"},
  "coordinate_system": {"space": "illustrator_document", "units": "pt", "y_axis": "up"},
  "artboard": {"index": 0, "name": "Artboard 1", "rect_pt": [left, top, right, bottom]},
  "settings": { "spacing_mm": 5, "margin_mm": 10, "curve_tolerance_mm": 0.25, "conservative_curves": true,
                "rotation": {"preset": "step", "step_deg": 5, "custom_angles_deg": [], "allow_full_360": true,
                             "max_abs_deg": 180, "prefer_original": true, "grain_lock": false, "allow_mirror": false},
                "optimization": {"quality": "balanced", "time_limit_s": 60, "max_iterations": null, "seed": 1},
                "material": {"mode": "fixed_artboard", "roll_max_length_mm": null,
                             "sheet_width_mm": null, "sheet_length_mm": null},
                "part_in_hole": true, "opaque_policy": "cut_line" },
  "groups": [{
    "id": "g001", "uuid": "1234", "name": "", "selection_index": 0, "layer": "Layer 1",
    "geometric_bounds_pt": [l, t, r, b], "visible_bounds_pt": [l, t, r, b],
    "trackers": [{"node_path": [0], "point_index": 0, "anchor_pt": [x, y]}, {"node_path": [2, 1], "point_index": 5, "anchor_pt": [x, y]}],
    "stats": {"points": 120, "paths": 3, "compounds": 1, "groups": 2, "opaque": 1},
    "export_issues": [],
    "root": {"kind": "group", "clipped": false, "children": [
      {"kind": "path", "name": "", "closed": true, "filled": true, "stroked": true, "clipping": false, "guides": false,
       "hidden": false, "locked": false, "opacity": 100, "fill_rule": "nonzero",
       "stroke": {"width_pt": 1, "join": "miter", "cap": "butt", "miter_limit": 10}, "visible_bounds_pt": [...],
       "points": [[ax, ay, leftX, leftY, rightX, rightY], ...]},
      {"kind": "compound", "fill_rule": "evenodd", "filled": true, "paths": [{"kind": "path", "closed": true, "points": [...]}]},
      {"kind": "opaque", "typename": "RasterItem", "geometric_bounds_pt": [...], "visible_bounds_pt": [...], "embedded": true},
      {"kind": "group", "clipped": true, "children": [ ... ]}
    ]}
  }],
  "skipped_selection": [{"typename": "PathItem", "name": "", "reason": "NOT_A_GROUP"}]
}
```

`node_path` = chỉ số con từ gốc Group (đúng thứ tự `pageItems`, 0 = trên cùng), dùng cho thông báo lỗi và tracker.
Đoạn Bézier i→i+1 dùng `anchor[i], right[i], left[i+1], anchor[i+1]`. Tọa độ NaN được ghi là `null`.

### 6.2 `autonest.analysis/1` (engine → UI) — `schema/analysis.schema.json`

Mỗi part: `status` (ok/warning/error), `source` (`nest_outline` | `clip_path` | `vector_union` [+`opaque_bounds`]),
`issues[]` (`code`, `severity`, `message`, `node_path`), `metrics` (diện tích silhouette/envelope/nest, bbox, bao lồi,
độ lồi, số lỗ, số đỉnh, số hướng xoay vừa khổ), `silhouette`/`envelope` = danh sách polygon
`{"exterior": [[x,y]...], "holes": [[[x,y]...]]}` theo mm trong sheet frame. Có `summary` và `issues` toàn cục.

### 6.3 `autonest.placement/1` (engine → Illustrator) — `schema/placement.schema.json`

```jsonc
{
  "schema": "autonest.placement/1",
  "source": {"geometry_sha256": "<sha256 của geometry.json>", "document": {...}, "artboard": {...}},
  "transform_convention": {"space": "illustrator_document", "units": "pt", "y_axis": "up",
                           "rotation": "counter_clockwise_degrees", "formula": "p' = target + R(theta) * F * (p - pivot)"},
  "status": "complete | partial | failed",
  "placements": [{"id": "g001", "uuid": "1234", "rotation_deg": 90, "mirror": false,
                  "pivot_pt": [x, y], "target_pt": [x, y], "matrix": [a, b, c, d, tx, ty],
                  "expected_trackers_pt": [[x, y], [x, y]]}],
  "unplaced": [{"id": "g007", "reason": "INVALID_GEOMETRY | DOES_NOT_FIT | NO_SPACE_LEFT | TIME_LIMIT", "detail": "..."}],
  "metrics": {"total_groups": 10, "placed": 9, "unplaced": 1, "used_length_mm": null, "utilization": 0.71,
              "min_gap_mm": 5.0, "collisions": 0, "boundary_violations": 0, "elapsed_s": 12.3, "seed": 1}
}
```

* `matrix` theo đúng nghĩa `Matrix` của Illustrator: `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`; luôn là phép quay
  cứng (det = ±1, không scale) **[ĐÃ TEST]** (`autonest/transform.py`).
* `geometry_sha256` buộc placement với đúng lần export; JSX từ chối Apply nếu Group đã thay đổi so với fingerprint.
* `samples/sample_placement.json` là **output thật** của `nest_engine.py nest --quality fast` (Phase 3A), kèm
  `sample_placement.svg`.
* Bổ sung có chủ đích ở v0.3.0 (đã ghi vào schema): `unplaced[].reason` thêm `VERIFICATION_FAILED`; khối
  `verification` (kết quả verifier độc lập); `placements[].name`, `pivot_mm`, `target_mm`, `expected_bounds_mm`
  (bounds silhouette sau biến đổi, mm); `metrics.utilization_used_height`, `metrics.placed_area_mm2`.
  Các trường cũ giữ nguyên tên và ý nghĩa.
* Bổ sung có chủ đích ở v0.4.0 (đã ghi vào schema): `settings.material.sheet_width_mm` / `sheet_length_mm` = khổ vải
  (rộng theo x, dài theo y), bắt đầu từ góc dưới-trái artboard (nơi solver bottom-left xếp trước) và được phép vượt ra
  ngoài artboard sang phải/lên trên; `null` = cả artboard. Vùng xếp = khổ vải trừ margin; analyze và verifier cùng dùng
  `contract.sheet_rect_mm`. Group không xếp được được dời sang phải của artboard hoặc khổ vải (cái nào xa hơn). Dung sai xoay
  theo canh vải (`--grain-tolerance`) không thêm trường mới: được ghi thành `rotation.preset=custom` +
  `custom_angles_deg` (0 và 180 ± k·step).

## 7. Thuật toán nesting (Phase 3A, đã triển khai)

Mã nguồn: `engine/autonest/nfp.py`, `nest.py`, `verify.py`, `baseline.py`.

1. **Hình va chạm** (không bao giờ là bbox) = envelope ⊕ đĩa bán kính spacing/2 + 0.002 mm (offset bo tròn ngoại tiếp,
   chứa đúng tổng Minkowski với đĩa). Sau đó đơn giản hóa *ra ngoài*: Douglas–Peucker δ rồi offset mitre δ, với δ = min(0.2, max(0.05, 0.04 × spacing)) mm (spacing 5 mm ⇒ 0.2 mm),
   có kiểm tra số học `hình_gốc − hình_mới = ∅`, nếu nghi ngờ thì giữ hình gốc. Hệ quả: khoảng cách thật luôn ≥ spacing,
   dư tối đa khoảng δ. `part_in_hole=false` ⇒ lấp lỗ trước khi tính.
2. **NFP** = A ⊕ (−B) tính bằng *phân rã lồi*: tam giác hóa Delaunay ràng buộc (GEOS) + gộp Hertel–Mehlhorn, tổng
   Minkowski từng cặp mảnh lồi = ghép cạnh theo góc (O(n+m), mọi cặp trong một lần sort numpy; v0.4: thay cho bao lồi
   của tổng đỉnh, nhanh hơn 2,4 lần, cùng kết quả trong sai số làm tròn), hợp bằng Clipper (số nguyên, 1e-4 mm) theo cây. Chính xác cho hình
   lõm, nhiều đảo, có lỗ (lỗ của NFP = vị trí lồng vào lỗ). Kiểm tra chéo bằng Shapely trên điểm ngẫu nhiên
   (`tests/test_nest.py`). Ghi chú: thử `pyclipper.MinkowskiSum` trực tiếp mất 14 s cho một cặp 200×200 đỉnh, nên đã bỏ.
   Cache theo (hình, góc, hình, góc) vì NFP bất biến với tịnh tiến; các mảnh giống nhau dùng chung cache.
   v0.4: các NFP còn thiếu của một bước đặt được tính song song (ProcessPoolExecutor, mặc định số nhân − 1, tối đa 8,
   `--workers`); cùng hàm nên cùng kết quả (có test so sánh). Worker tự thoát khi tiến trình nest chết (Cancel), worker
   chết giữa chừng ⇒ tính tiếp tuần tự (`metrics.parallel_error`). Mảnh lồi sau phân rã bỏ đỉnh thẳng hàng/lõm rất nhẹ
   (nếu không, nhiễu xoay 90° làm lệch NFP khi ghép cạnh theo góc).
3. **IFP** của artboard chữ nhật = hình chữ nhật suy từ AABB của envelope đã xoay (chính xác với container chữ nhật).
   Hướng xoay không vừa bị loại trước.
4. **Vị trí** = đỉnh của IFP − ⋃NFP (Clipper). Mục tiêu bottom-left: cạnh trên thấp nhất, rồi trái nhất, rồi góc gần 0.
   **Cắt tỉa chính xác theo túi trống**: envelope E đặt hợp lệ thì E ⊕ đĩa(spacing/2 + 0.002) nằm trong hình va chạm của nó,
   nên E tránh mọi hình va chạm đã đặt nới thêm spacing/2 + 0.002 và nằm trong vùng dùng được. Nếu E liền một khối, nó nằm
   trọn trong một thành phần liên thông ("túi") của vùng trống đó, nên điểm tham chiếu nằm trong hình chữ nhật mà bbox của E
   vừa bbox túi. Chỉ tính NFP của các mảnh có bbox va chạm chạm tới các hình chữ nhật đó; vị trí ngoài chúng vốn đã không
   hợp lệ. Không có túi nào vừa ⇒ bỏ qua góc đó ngay.
5. **Xoay**: coarse-to-fine trong tập góc cho phép (fast 8 góc, balanced 12 góc + tinh chỉnh ±1 bước tới khi hết cải thiện,
   high_quality 36 góc + tinh chỉnh). Mirror bị từ chối (`allow_mirror=true` ⇒ lỗi rõ ràng).
6. **Thứ tự**: diện tích giảm dần; balanced/high_quality chạy thêm thứ tự "cạnh dài giảm dần" và các hoán vị ngẫu nhiên
   theo seed (multi-start, tối đa 6/40 lần) trong giới hạn thời gian; chọn kết quả xếp nhiều nhất, rồi diện tích lớn nhất,
   rồi chiều cao dùng nhỏ nhất. Chưa có simulated annealing / GA. Lần chạy đầu luôn đặt hết các mảnh vừa: quá giới hạn
   thời gian thì các mảnh còn lại chỉ thử góc 0 và bội 90° (`finished_with_few_angles`), không bị bỏ vì `TIME_LIMIT`;
   mảnh không vừa ở các góc đó báo `TIME_LIMIT` (chưa thử hết góc). Chạy quá tối đa max(2 × giới hạn, 30 s) thì dừng.
7. **Verifier độc lập** (`verify.py`, không dùng NFP/Clipper/hình va chạm): dựng lại silhouette từ geometry.json, áp *ma trận
   Illustrator* trong placement.json, kiểm tra bằng Shapely/GEOS: chồng lấn, khoảng cách ≥ spacing (dung sai 1e-6 mm),
   nằm trong vùng artboard − margin (dung sai 1e-3 mm), ma trận cứng (det=+1, trực chuẩn), góc thuộc tập cho phép, ma trận
   khớp pivot/target/góc, id đầy đủ. Không đạt ⇒ `status: "failed"`, `placements: []`, mọi Group `VERIFICATION_FAILED`.
8. **Baseline**: MaxRects quy tắc bottom-left trên bbox của envelope (+spacing), xoay 0/90 nếu được phép; cùng verifier.
9. **Đường cắt làm outline** (`opaque_policy = "cut_line"`): với file "ảnh in + đường cắt", path đóng có stroke, không
   fill, có bbox lớn nhất trong Group được dùng như `NEST_OUTLINE`. Phần ảnh nằm ngoài đường cắt được báo
   (`OUTLINE_SMALLER_THAN_ARTWORK`, kèm `overflow_mm`) và coi như trong suốt. Nét vector nằm ngoài đường cắt (số thứ tự
   chi tiết, dấu bấm) được in nên cũng va chạm: phần nằm xa đường cắt hơn spacing/2 được thêm vào hình va chạm (bao lồi
   từng mảnh, lấp lỗ). Phần trong khoảng spacing/2 không bao giờ chạm chi tiết khác vì các đường cắt cách nhau ≥ spacing.
10. **Góc bắt đầu** (`optimization.start_corner` = bottom_left | bottom_right | top_left | top_right, mặc định bottom_left,
   panel "Nest from", CLI `--start-corner`): khóa so sánh vị trí là cạnh gần góc bắt đầu (thấp nhất / cao nhất, rồi trái
   nhất / phải nhất). Bắt đầu từ góc trên: khổ vải treo từ góc trên-trái artboard và kéo xuống (roll cũng kéo dài xuống dưới);
   "Fit artboard" giữ cạnh trên, đổi cạnh dưới theo chiều dài đã xếp.
   Khi chạy song song, NFP của mọi góc sắp thử của một mảnh được tính trong một lô.
11. **Roll** (`material.mode = "roll"`, panel "Extend length upward"): chiều dài vùng xếp lên tới `roll_max_length_mm`
   (mặc định 5000 mm, dưới giới hạn canvas 5779 mm); `utilization` tính trên chiều dài đã dùng. Mirror vẫn bị từ chối.

## 8. Apply và rollback (Phase 4, đã triển khai: `jsx/lib/an_apply.jsxinc`)

1. **Kiểm tra trước, không sửa gì** (sai ở bất kỳ điểm nào ⇒ trạng thái `refused`, tài liệu giữ nguyên, trả danh sách lý do):
   `schema` của placement/geometry, `status` complete|partial, `verification.ok`, sha256 của geometry.json (panel tính
   bằng Node; script đơn không tính vì SHA-256 trong ExtendScript quá chậm với file vài MB), tên tài liệu, artboard
   (index + `artboardRect` ±0.01 pt), trục y hướng lên; với từng Group: id/uuid khớp, không trùng uuid, `mirror=false`,
   ma trận khớp `rotation_deg/pivot_pt/target_pt`, `expected_trackers_pt` = ma trận × tracker của geometry, tìm thấy
   bằng `getPageItemFromUuid`, là GroupItem, không bị khóa/layer không khóa/không ẩn, có ≥ 2 tracker, và **fingerprint**:
   tracker hiện tại cách vị trí lúc export ≤ 0.01 pt (Group đã bị di chuyển/sửa ⇒ từ chối, yêu cầu Nest lại).
2. Với từng Group: `rotate(theta, true, true, true, true, Transformation.CENTER)` (pattern/gradient cùng xoay), đọc
   tracker 0, `translate()` để tracker 0 trùng điểm mong đợi (không phụ thuộc tâm xoay Illustrator dùng), rồi kiểm tra
   **cả hai** tracker ≤ 0.02 pt (Illustrator lưu tọa độ single-precision). Không có mirror.
3. Không ungroup, không duplicate/thay thế, không đổi layer/z-order; chỉ biến đổi chính Group.
4. Lỗi bất kỳ (lỗi DOM hoặc tracker lệch) ⇒ khôi phục mọi Group đã đụng tới, ngược thứ tự, từ vị trí tracker ghi lúc
   đầu (xoay về đúng góc theo hướng tracker0→tracker1, rồi dịch), kiểm tra lại ≤ 0.02 pt ⇒ `rolled_back`; nếu không
   khôi phục được ⇒ `rollback_failed` kèm danh sách Group, khuyên Edit > Undo / File > Revert.
5. Group không xếp được (`unplaced`) được dời sang **bên phải mọi artboard và khổ vải** (cách 10 mm, xếp cột, chỉ tịnh
   tiến) để không chồng lên mảnh đã xếp; khi rollback được dời ngược đúng quãng đã thật sự dời.
6. Kiểm tra độc lập: `tools/check_apply.py` so **mọi** anchor và handle của hai lần export (trước/sau Apply) với
   ma trận placement; dùng cho test trên Illustrator thật.
7. Panel CEP: host ghi câu trả lời vào một file tạm do panel chọn, ngoài việc trả qua evalScript, vì trên Illustrator
   thật câu trả lời evalScript của một lần export dài đã không về (panel đếm giây mãi). Panel dùng cái về trước; Cancel
   dừng chờ. Bảng tiến trình ScriptUI không dùng khi gọi từ panel (nghi là nguyên nhân).
8. Tuỳ chọn đổi artboard (panel "resize the artboard"): sau khi đặt + dời xong, artboard = [trái, đáy + (đỉnh cao nhất
   của `expected_bounds_mm` + margin), trái + rộng khổ vải, đáy]; đọc lại kiểm ≤ 0.02 pt; lỗi ⇒ trả artboard cũ và hoàn
   tác mọi Group (artboard được đọc lại để kiểm). Dùng lại bản export: sau export host trả một chữ ký vùng chọn (tài
   liệu, index + khung artboard, từng Group: loại, cờ, bounds của mọi item, và với mọi path: số điểm, diện tích, chu vi;
   một lần đọc DOM mỗi thuộc tính, không đọc từng điểm). Lần Nest sau host tính lại và so; panel còn kiểm sha256 của
   geometry.json không đổi. Khác ⇒ export lại. Cancel lúc Apply ⇒ bỏ kết quả, phải Nest lại.
9. Panel CEP (`panel/`): Nest = `AN_panelExport` → `autonest.exe nest` (PyInstaller, onedir) → placement + SVG;
   Preview = `placement.svg`; Apply = `AN_panelApply(placementPath, sha256)`. Host script
   `dist/AutoNesting_PanelHost.jsx` được nạp bằng `$.evalFile`. Giao diện app bằng tiếng Anh.

## 9. Kiểm thử

| Yêu cầu test | Fixture | Trạng thái (Phase 2 / 3A) |
|---|---|---|
| 1. 10 mảnh L/U | `01_LU_10` | phân tích ✔; nesting 3A ✔ (verifier) |
| 2. 20 concave | `02_concave_20` | phân tích ✔ |
| 3. 30–50 Bézier | `03_bezier_40` (40) | phân tích ✔ |
| 4. Clipping + raster | `04_clip_raster` (9 case) | ✔ |
| 5. Subpaths + compound | `05_compound_multi` | ✔ |
| 6. Mảnh rất nhỏ gần biên | `06_small_near_edge` | ✔ |
| 7. Không xếp hết | `07_overflow` (60 mảnh) | phát hiện tổng diện tích vượt + mảnh quá lớn ✔; nesting 3A: partial, đúng lý do ✔ |
| 8. Artboard offset | `08_offset_artboard` | ✔ |
| 9. Rotation 5° và 1° | `09_rotation_1deg` + unit test | kiểm tra vừa khổ theo góc ✔ (thanh 680×4 mm chỉ vừa ở ~32–33°) |
| 10. Holes, open paths, self-intersections | `10_invalid_geometry` (17 case) | ✔ |

Phase 3A đo placed count, polygon collision count, min actual gap, boundary violations, utilization, runtime trên mọi
fixture và 3 bộ tổng hợp: `docs/benchmark/BENCHMARK.md`. Transform accuracy trong Illustrator: Phase 4/5, cần máy thật.

## 10. Rủi ro và điểm chưa kiểm chứng

* Toàn bộ hành vi DOM của Illustrator thật (tọa độ, bounds của clip group, `uuid`, tốc độ đọc PathPoint với hàng chục
  nghìn điểm, `File.execute()`) mới chỉ được giả lập. Cần chạy `Illustrator_AutoNesting.jsx` trên tài liệu thật
  và đối chiếu: số Group, bounds, cảnh báo `BOUNDS_MISMATCH/COORDINATE_MISMATCH` phải bằng 0 trên artwork thông thường.
* Hiệu ứng (live effects, brush, opacity mask) chỉ được phát hiện gián tiếp qua `visibleBounds`.
* Ảnh raster có nền trong suốt luôn cần `NEST_OUTLINE` (hoặc chấp nhận khung ảnh với `use_bounds`).
