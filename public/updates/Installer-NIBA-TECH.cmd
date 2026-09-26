@echo off
REM ===========================================================================
REM  NIBA TECH Stock - installation sans le message "Windows a protege votre PC"
REM
REM  Le "controle intelligent de Windows" (Microsoft Defender SmartScreen)
REM  bloque les programmes qui ne sont pas signes numeriquement. Un fichier
REM  telecharge depuis Internet porte un marqueur (Mark of the Web) qui declenche
REM  ce blocage. Ce script retire ce marqueur puis lance l'installateur.
REM
REM  Si Windows affiche quand meme un avertissement : clique droit sur
REM  l'installateur -> "Executer quand meme".
REM ===========================================================================
setlocal
cd /d "%~dp0"

REM Nom du fichier installateur : passe en argument 1, sinon detecte
REM automatiquement le plus recent "NIBA TECH Stock-Setup-*.exe" du dossier.
set "SETUP=%~1"
if not "%SETUP%"=="" goto launch

for /f "delims=" %%F in ('dir /b /o-d "NIBA TECH Stock-Setup-*.exe" 2^>nul') do (
  if not defined SETUP set "SETUP=%%F"
)

if not defined SETUP (
  echo.
  echo   ERREUR : aucun installateur "NIBA TECH Stock-Setup-*.exe" trouve ici.
  echo   Placez ce fichier dans le meme dossier que l'installateur.
  echo.
  pause
  exit /b 1
)

:launch
if not exist "%SETUP%" (
  echo.
  echo   ERREUR : installateur introuvable : "%SETUP%"
  echo.
  pause
  exit /b 1
)

echo.
echo   Installateur detecte : %SETUP%
echo   Suppression du marqueur "fichier provenant d'Internet"...
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%CD%\%SETUP%' -ErrorAction SilentlyContinue" 2>nul

REM Retire aussi le marqueur eventuel du script lui-meme.
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%~f0' -ErrorAction SilentlyContinue" 2>nul

echo   Lancement de l'installateur...
echo.
start "" "%SETUP%"
echo   Si Windows affiche encore un avertissement, choisissez "Executer quand meme"
echo   (ou ce message, en haut du bouton).
echo.
echo   L'application ne doit pas etre en cours d'execution pendant l'installation :
echo   fermez-la depuis l'icone en bas a droite de la barre des taches.
echo.
pause
