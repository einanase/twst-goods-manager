# Automated update script
Write-Host "Pushing changes to GitHub..."
git add .
git commit -m "Automated update: Image fixes and logic"
git push origin main
Write-Host "Done! Please reload the browser (Ctrl+F5)."
Pause
