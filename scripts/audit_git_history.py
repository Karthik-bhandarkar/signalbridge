import subprocess

patterns = [
    'Admin@123',
    'admin123',
    'Admin123',
    'admin@123',
    'password123',
    'whsec_',
    'alert_token_',
    'POSTGRES_PASSWORD',
    'DJANGO_SECRET_KEY',
    'test_secret',
]

print("=== GIT HISTORY SECRET AUDIT ===")
for pat in patterns:
    res = subprocess.run(['git', 'log', '-S', pat, '--oneline'], capture_output=True, text=True)
    lines = [l.strip() for l in res.stdout.split('\n') if l.strip()]
    commits = [l.split()[0] for l in lines]
    print(f"Pattern '{pat}': {len(commits)} commits -> {commits}")

