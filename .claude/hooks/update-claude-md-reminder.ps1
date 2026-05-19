# PostToolUse hook: after any PowerShell git commit, remind Claude to update CLAUDE.md.
# Receives the tool call JSON on stdin.

$inputText = [Console]::In.ReadToEnd()

if ($inputText -match "git commit" -and $inputText -notmatch "skip claude-md") {
    Write-Output "A git commit was just made. Please run 'git diff HEAD~1 HEAD' to review what changed, then update CLAUDE.md if any changes affect documented architecture, routes, features, or behaviors. Use [skip claude-md] in the commit message if the CLAUDE.md commit itself triggers this."
}
