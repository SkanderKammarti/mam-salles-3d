@echo off
title Salles 3D — La Maison Africaine du Medecin
cd /d "%~dp0"
echo.
echo  ============================================================
echo   SALLES 3D - LA MAISON AFRICAINE DU MEDECIN
echo   Demarrage du serveur local...
echo  ============================================================
echo.
echo  Le navigateur va s'ouvrir automatiquement.
echo  Si ce n'est pas le cas, ouvrez : http://localhost:8765
echo.
echo  Gardez cette fenetre ouverte pendant la presentation.
echo  Appuyez sur Ctrl+C pour arreter.
echo.
start "" http://localhost:8765
python -m http.server 8765
pause
