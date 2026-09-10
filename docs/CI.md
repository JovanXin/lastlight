# Continuous integration and deployment

The app is published with GitHub Pages using the classic **deploy from a branch**
build, so no workflow file is required: Pages serves the repository root of
\`main\`, which contains \`index.html\`. The \`.nojekyll\` file disables Jekyll so
everything is served verbatim.

## Enabling the GitHub Actions workflows

The ready-to-use workflows live in this folder rather than in
\`.github/workflows/\` because pushing a workflow file requires the token to carry
GitHub's \`workflow\` OAuth scope, which the CLI token used for this repo does not
have. To turn them on:

\`\`\`sh
gh auth refresh -h github.com -s workflow
mkdir -p .github/workflows
cp docs/ci/ci.yml docs/ci/pages.yml .github/workflows/
git add .github && git commit -m "Enable CI and Pages workflows" && git push
\`\`\`

Once pushed, switch Pages to the GitHub Actions source:

\`\`\`sh
echo '{"build_type":"workflow"}' | gh api -X PUT repos/JovanXin/lastlight/pages --input -
\`\`\`

## What the workflows do

- \`ci.yml\` runs \`npm test\` on every push and pull request.
- \`pages.yml\` assembles a minimal \`_site/\` directory and deploys it to Pages.

Neither workflow has any third-party dependencies beyond the official
\`actions/*\` steps.
