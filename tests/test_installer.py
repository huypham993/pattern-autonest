"""Static checks of the Windows installer files (they can only run on Windows)."""
import re
from pathlib import Path

import autonest

ROOT = Path(__file__).resolve().parents[1]


def test_installer_version_matches_engine_and_panel():
    iss = (ROOT / "installer" / "AutoNesting.iss").read_text()
    manifest = (ROOT / "panel" / "CSXS" / "manifest.xml").read_text()
    assert re.search(r'#define AppVersion "([^"]+)"', iss).group(1) == autonest.__version__
    assert f'ExtensionBundleVersion="{autonest.__version__}"' in manifest


def test_windows_scripts_are_ascii_crlf():
    files = [ROOT / "Build_Setup.cmd", ROOT / "Install_AutoNesting.cmd", ROOT / "installer" / "AutoNesting.iss",
             *(ROOT / "tools" / "windows").glob("*.cmd")]
    for f in files:
        data = f.read_bytes()
        data.decode("ascii")
        assert data.count(b"\n") == data.count(b"\r\n"), f.name
