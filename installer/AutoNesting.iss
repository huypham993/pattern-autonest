; Illustrator Auto Nesting - one-file installer. Packed by Build_Setup.cmd from dist\panel\com.autonest.panel.
; The target PC needs nothing else: no Python, no build step.
#define AppVersion "0.4.0"

[Setup]
AppId={{8F3A6C2E-5B1D-4E7A-9C3F-2A6D1E8B4C70}
AppName=AutoNesting for Illustrator
AppVersion={#AppVersion}
AppPublisher=AutoNesting
UninstallDisplayName=AutoNesting for Illustrator
DefaultDirName={userappdata}\Adobe\CEP\extensions\com.autonest.panel
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=AutoNesting_Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[InstallDelete]
; replace an older version completely, like install_panel.cmd (robocopy /MIR)
Type: filesandordirs; Name: "{app}\*"

[Files]
Source: "..\dist\panel\com.autonest.panel\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; unsigned CEP panels load only with PlayerDebugMode=1; without an unins* flag the value stays at uninstall (other panels may need it)
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"

[Messages]
FinishedLabel=AutoNesting is installed. Restart Illustrator, then open Window > Extensions > AutoNesting.
