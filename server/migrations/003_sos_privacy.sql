ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CHECK(role IN ('SUPER_ADMIN','ADMIN','DRIVER','STUDENT','PARENT'));
ALTER TABLE users ADD CHECK(phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
CREATE TABLE parent_students (
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 parent_id BIGINT NOT NULL, student_id BIGINT NOT NULL,
 PRIMARY KEY(tenant_id,parent_id,student_id),
 FOREIGN KEY(tenant_id,parent_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,student_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE sos_events ALTER COLUMN trip_id DROP NOT NULL;
ALTER TABLE sos_events ADD UNIQUE(tenant_id,id);
ALTER TABLE sos_events ADD COLUMN type TEXT NOT NULL DEFAULT 'OTHER' CHECK(type IN('ACCIDENT','MEDICAL','BREAKDOWN','UNSAFE','LOST','OTHER')),
 ADD COLUMN message VARCHAR(300) NOT NULL DEFAULT 'Legacy emergency alert',
 ADD COLUMN raised_by_role TEXT NOT NULL DEFAULT 'DRIVER' CHECK(raised_by_role IN('DRIVER','STUDENT','PARENT')),
 ADD COLUMN student_id BIGINT,
 ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','ACKNOWLEDGED','RESOLVED')),
 ADD COLUMN acknowledged_by BIGINT, ADD COLUMN acknowledged_at TIMESTAMPTZ,
 ADD COLUMN resolved_by BIGINT, ADD COLUMN resolved_at TIMESTAMPTZ,
 ADD FOREIGN KEY(tenant_id,student_id) REFERENCES users(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,acknowledged_by) REFERENCES users(tenant_id,id),
 ADD FOREIGN KEY(tenant_id,resolved_by) REFERENCES users(tenant_id,id),
 ADD CHECK(type <> 'OTHER' OR length(trim(message))>0),
 ADD CHECK(latitude BETWEEN -90 AND 90), ADD CHECK(longitude BETWEEN -180 AND 180);
UPDATE sos_events s SET raised_by_role=u.role, student_id=CASE WHEN u.role='STUDENT' THEN u.id END,
 status=CASE WHEN s.resolved THEN 'RESOLVED' ELSE 'OPEN' END FROM users u WHERE u.tenant_id=s.tenant_id AND u.id=s.raised_by;
CREATE TABLE sos_recipients (
 tenant_id BIGINT NOT NULL, sos_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN('IN_APP','SMS','WHATSAPP')),
 status TEXT NOT NULL CHECK(status IN('PENDING','DELIVERED','SEEN','ACKNOWLEDGED','FAILED','NOT_CONFIGURED')),
 sent_at TIMESTAMPTZ,error TEXT,
 PRIMARY KEY(tenant_id,sos_id,user_id,channel),
 FOREIGN KEY(tenant_id,sos_id) REFERENCES sos_events(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX sos_sender_time ON sos_events(tenant_id,raised_by,created_at);
DO $$DECLARE t TEXT;BEGIN FOREACH t IN ARRAY ARRAY['parent_students','sos_recipients'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id::text=current_setting(''app.tenant_id'',true) OR current_setting(''app.platform'',true)=''true'')',t);
END LOOP;END$$;
