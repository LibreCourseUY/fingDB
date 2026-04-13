#!/bin/sh
set -e

# Generate warden.toml with Python to avoid shell escaping issues
uv run python -c "
import os, re

db_url = os.getenv('DATABASE_URL', 'sqlite:///./data/fingdb.db')

# Auto-detect database type from URL
if db_url.startswith('postgresql') or db_url.startswith('postgres'):
    db_type = 'postgresql'
else:
    db_type = 'sqlite'

# Strip any driver suffix so dbwarden gets plain postgresql:// or sqlite://
db_url = re.sub(r'^postgresql(\+\w+)?://', 'postgresql://', db_url)
db_url = re.sub(r'^postgres(\+\w+)?://', 'postgresql://', db_url)
db_url = re.sub(r'^sqlite(\+\w+)?://', 'sqlite://', db_url)

with open('warden.toml', 'w') as f:
    f.write('default = \"primary\"\n\n')
    f.write('[database]\n')
    f.write('[database.primary]\n')
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
