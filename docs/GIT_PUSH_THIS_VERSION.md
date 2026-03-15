# Save this working version to Git

Use this to create a restore point so you can always come back to this state.

## If the repo is already connected to GitHub

From the project root:

```bash
cd "/Users/ronathmukadange/Documents/UCL/SE Year 3/Distributed Systems/Assignment 01/distributed-jokes"

git status
git add -A
# Don't commit secrets: .env and terraform.tfvars are in .gitignore
git status
git commit -m "Working state: Kong+nginx, OIDC FQDN, MySQL+Mongo on Joke VM, DB docs and 502/Joke debug"

git push origin main
```

(Use your actual branch name if it’s not `main`.)

## If this folder is not yet a Git repo

```bash
cd "/Users/ronathmukadange/Documents/UCL/SE Year 3/Distributed Systems/Assignment 01/distributed-jokes"

git init
git add -A
git status
git commit -m "Working state: Kong+nginx, OIDC FQDN, MySQL+Mongo on Joke VM, DB docs"

# Create a repo on GitHub (e.g. your-username/distributed-jokes), then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## What’s not committed (on purpose)

- `.env` – local secrets
- `terraform/terraform.tfvars` – your Azure/vars (may contain sensitive values)
- `*.tfstate` – Terraform state (often kept in backend or not in repo)

So you won’t lose secrets by pushing. To fully restore infra later you’d still need the same tfvars (or re-enter them) and Terraform state.

## Tag this version (optional)

So you can later checkout or revert to this exact version:

```bash
git tag -a v1-working-azure -m "Kong+nginx, OIDC, MySQL+Mongo on Azure, docs"
git push origin v1-working-azure
```

To return to it later: `git checkout v1-working-azure` or `git checkout main` to go back to latest.
