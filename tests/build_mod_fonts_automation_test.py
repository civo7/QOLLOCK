"""Exercise only font staging, never the compiler, packer or game directories."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")


@unittest.skipUnless(POWERSHELL, "PowerShell is required for isolated staging checks")
class FontStagingTests(unittest.TestCase):
    def test_fonts_are_copied_updated_and_restored_without_compilation(self):
        script = (ROOT / "build_mod/build_mod.ps1").read_text(encoding="utf-8")
        start = script.index("            if ($file.Extension -ieq '.ttf') {")
        end = script.index("            if ($AllowedExts", start)
        block = script[start:end]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "Mojang-Regular.ttf"
            source.write_bytes(b"font staging fixture")
            env = dict(os.environ, FONT_TEST_ROOT=str(root))
            command = """
                $ErrorActionPreference = 'Stop'
                $file = Get-Item -LiteralPath (Join-Path $env:FONT_TEST_ROOT 'Mojang-Regular.ttf')
                $TempGame = Join-Path $env:FONT_TEST_ROOT 'staging'
                $relPath = 'panorama/fonts/Mojang-Regular.ttf'
                $hashChanged = $false
            """ + block + """
                $dest = Join-Path $TempGame $relPath
                if ([IO.File]::ReadAllText($dest) -ne 'font staging fixture') { throw 'Missing font' }
                [IO.File]::WriteAllText($file.FullName, 'updated font')
                $hashChanged = $true
            """ + block + """
                if ([IO.File]::ReadAllText($dest) -ne 'updated font') { throw 'Stale font' }
                Remove-Item -LiteralPath $dest
                $hashChanged = $false
            """ + block + """
                if ([IO.File]::ReadAllText($dest) -ne 'updated font') { throw 'Font not restored' }
            """
            result = subprocess.run([POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", command],
                                    env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
