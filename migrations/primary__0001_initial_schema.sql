-- upgrade

BEGIN;

CREATE TYPE tipo_previa_enum AS ENUM ('aprobado', 'exonerado');
CREATE TYPE periodo_enum AS ENUM ('q1', 'q2', 'q3', 'anual');

CREATE TABLE institutos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE carreras (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE perfiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    carrera_id INTEGER NOT NULL REFERENCES carreras(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE materias (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    codigo VARCHAR(50),
    periodo periodo_enum NOT NULL,
    creditos INTEGER NOT NULL DEFAULT 0,
    min_creditos INTEGER,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    instituto_id INTEGER NOT NULL REFERENCES institutos(id) ON DELETE CASCADE
);

CREATE TABLE materia_previas (
    materia_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    previa_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    tipo tipo_previa_enum NOT NULL,
    PRIMARY KEY (materia_id, previa_id, tipo),
    UNIQUE (materia_id, previa_id, tipo)
);

CREATE TABLE carrera_materias (
    id SERIAL PRIMARY KEY,
    carrera_id INTEGER NOT NULL REFERENCES carreras(id) ON DELETE CASCADE,
    materia_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL,
    UNIQUE (carrera_id, materia_id, tipo)
);

CREATE TABLE perfil_materias (
    id SERIAL PRIMARY KEY,
    perfil_id INTEGER NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    materia_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL,
    UNIQUE (perfil_id, materia_id, tipo)
);

CREATE INDEX idx_materias_instituto ON materias(instituto_id);
CREATE INDEX idx_materias_periodo ON materias(periodo);
CREATE INDEX idx_perfiles_carrera ON perfiles(carrera_id);
CREATE INDEX idx_materia_previas_materia ON materia_previas(materia_id);
CREATE INDEX idx_materia_previas_previa ON materia_previas(previa_id);
CREATE INDEX idx_carrera_materias_carrera ON carrera_materias(carrera_id);
CREATE INDEX idx_carrera_materias_materia ON carrera_materias(materia_id);
CREATE INDEX idx_perfil_materias_perfil ON perfil_materias(perfil_id);
CREATE INDEX idx_perfil_materias_materia ON perfil_materias(materia_id);

COMMIT;

-- rollback

BEGIN;
DROP TABLE IF EXISTS perfil_materias;
DROP TABLE IF EXISTS carrera_materias;
DROP TABLE IF EXISTS materia_previas;
DROP TABLE IF EXISTS materias;
DROP TABLE IF EXISTS perfiles;
DROP TABLE IF EXISTS carreras;
DROP TABLE IF EXISTS institutos;
DROP TYPE IF EXISTS periodo_enum;
DROP TYPE IF EXISTS tipo_previa_enum;
COMMIT;
