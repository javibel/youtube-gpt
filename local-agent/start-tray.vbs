Set oShell = CreateObject("WScript.Shell")
oShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\tray.ps1""", 0, False
