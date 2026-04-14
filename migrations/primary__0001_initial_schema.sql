-- upgrade

CREATE TABLE IF NOT EXISTS institutos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL
)

CREATE TABLE IF NOT EXISTS carreras (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL
)

CREATE TABLE IF NOT EXISTS perfiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    carrera_id INTEGER NOT NULL REFERENCES carreras(id),
    created_at TIMESTAMP NOT NULL
)

CREATE TABLE IF NOT EXISTS materias (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    codigo VARCHAR(50),
    periodo VARCHAR(11) NOT NULL,
    creditos INTEGER NOT NULL DEFAULT 0,
    min_creditos INTEGER,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    instituto_id INTEGER NOT NULL REFERENCES institutos(id)
)

CREATE TABLE IF NOT EXISTS materia_previas (
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    previa_id INTEGER NOT NULL REFERENCES materias(id),
    tipo VARCHAR(9) NOT NULL,
    PRIMARY KEY (materia_id, previa_id, tipo)
)

CREATE TABLE IF NOT EXISTS carrera_materias (
    id SERIAL PRIMARY KEY,
    carrera_id INTEGER NOT NULL REFERENCES carreras(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    tipo VARCHAR(20) NOT NULL
)

CREATE TABLE IF NOT EXISTS perfil_materias (
    id SERIAL PRIMARY KEY,
    perfil_id INTEGER NOT NULL REFERENCES perfiles(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    tipo VARCHAR(20) NOT NULL
)

-- rollback

DROP TABLE perfil_materias

DROP TABLE carrera_materias

DROP TABLE materia_previas

DROP TABLE materias

DROP TABLE perfiles

DROP TABLE carreras

DROP TABLE institutos
