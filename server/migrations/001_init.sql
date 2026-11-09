CREATE TABLE members (
  id          INTEGER PRIMARY KEY,
  discord_id  TEXT UNIQUE,
  pseudo      TEXT NOT NULL,
  avatar      TEXT,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  color       TEXT NOT NULL DEFAULT '#5865F2',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_login  TEXT
);

-- Une ligne = un créneau d'une heure où le membre est LIBRE
CREATE TABLE availability (
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,          -- YYYY-MM-DD
  hour       INTEGER NOT NULL,       -- 8 = créneau 8h-9h
  PRIMARY KEY (member_id, date, hour)
);
CREATE INDEX idx_availability_date ON availability(date);

CREATE TABLE event_types (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  color     TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  archived  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  start_min   INTEGER NOT NULL,      -- minutes depuis minuit
  end_min     INTEGER NOT NULL,
  type_id     INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_min > start_min)
);
CREATE INDEX idx_events_date ON events(date);

CREATE TABLE event_participants (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, member_id)
);
CREATE INDEX idx_participants_member ON event_participants(member_id);

INSERT INTO event_types (name, color, position) VALUES
  ('Staff Meeting',          '#C9DAF8', 1),
  ('Scrim',                  '#B6D7A8', 2),
  ('Coaching indiv',         '#F9CB9C', 3),
  ('Match',                  '#EA9999', 4),
  ('Team building',          '#D5A6BD', 5),
  ('Cours théorique',        '#FFE599', 6),
  ('Sparring',               '#A2C4C9', 7),
  ('Review',                 '#B4A7D6', 8),
  ('Team meeting',           '#F6B26B', 9),
  ('Point analyste',         '#93C47D', 10),
  ('Prépa cours théorique',  '#D9D9D9', 11),
  ('Watch Party',            '#27EBF5', 12),
  ('One one',                '#7970DB', 13);
