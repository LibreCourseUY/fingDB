#!/bin/sh
set -e

# Generate warden.toml with Python to avoid shell escaping issues
uv run python -c "
import os, re

env = os.getenv('ENVIRONMENT', 'DEV')
if env == 'PROD':
    db_type = 'postgresql'
    db_url = os.environ['DATABASE_URL']
    # Strip any driver suffix so dbwarden gets plain postgresql://
    db_url = re.sub(r'^postgresql(\+\w+)?://', 'postgresql://', db_url)
else:
    db_type = 'sqlite'
    db_url = os.getenv('DATABASE_URL', 'sqlite:///./data/fingdb.db')

with open('warden.toml', 'w') as f:
    f.write('default = \"main\"\n\n')
    f.write('[database]\n')
    f.write('[database.main]\n')
    f.write('database_type = \"' + db_type + '\"\n')
    f.write('sqlalchemy_url = \"' + db_url + '\"\n')
    f.write('model_paths = [\"app/models/\"]\n')
    f.write('migrations_dir = \"migrations\"\n')

print(f'warden.toml generated: type={db_type}')
"

# Run migrations
uv run dbwarden migrate --verbose

# Start application
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8080
