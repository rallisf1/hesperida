-- ------------------------------
-- OPTION
-- ------------------------------

OPTION IMPORT;

-- ------------------------------
-- BUCKETS
-- ------------------------------

DEFINE BUCKET IF NOT EXISTS screenshots BACKEND 'file:/mydata/screenshots';

-- ------------------------------
-- TABLE: users
-- ------------------------------

DEFINE TABLE IF NOT EXISTS users TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select, update, delete WHERE id = $auth.id;

DEFINE FIELD IF NOT EXISTS created_at ON users TYPE datetime READONLY VALUE time::now() READONLY;
DEFINE FIELD IF NOT EXISTS email ON users TYPE string ASSERT string::is_email($value);
DEFINE FIELD IF NOT EXISTS forgot_token ON users TYPE option<string>;
DEFINE FIELD IF NOT EXISTS name ON users TYPE string;
DEFINE FIELD IF NOT EXISTS notification_targets ON users TYPE option<array<object>> DEFAULT [];
DEFINE FIELD IF NOT EXISTS notification_targets.* ON users TYPE object;
DEFINE FIELD IF NOT EXISTS notification_targets.*.id ON users TYPE string;
DEFINE FIELD IF NOT EXISTS notification_targets.*.target ON users TYPE string;
DEFINE FIELD IF NOT EXISTS notification_targets.*.label ON users TYPE option<string>;
DEFINE FIELD IF NOT EXISTS notification_targets.*.enabled ON users TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS notification_targets.*.created_at ON users TYPE datetime;
DEFINE FIELD IF NOT EXISTS notification_targets.*.updated_at ON users TYPE datetime;
DEFINE FIELD IF NOT EXISTS password ON users TYPE string;
DEFINE FIELD IF NOT EXISTS role ON users TYPE string DEFAULT 'editor' ASSERT ['admin', 'editor', 'viewer'].includes($value);

DEFINE ACCESS OVERWRITE users ON DATABASE DURATION FOR SESSION 1h TYPE RECORD
	SIGNIN (
		SELECT * FROM users WHERE email = $email AND crypto::argon2::compare(password, $password)
	)
	SIGNUP (
		CREATE users CONTENT {
			name: $name,
			email: $email,
			password: crypto::argon2::generate($password)
		}
	);

DEFINE INDEX IF NOT EXISTS email_unq ON users FIELDS email UNIQUE;
DEFINE INDEX IF NOT EXISTS forgot_token_idx ON users FIELDS forgot_token;

DEFINE EVENT OVERWRITE user_delete ON users WHEN $event = 'DELETE' THEN {
	DELETE websites WHERE owner = $before.id;
	UPDATE websites SET users = array::filter(users ?? [], |$u| $u != $before.id) WHERE $before.id IN users;
};

-- ------------------------------
-- TABLE DATA: users
-- ------------------------------


-- ------------------------------
-- TABLE: websites
-- ------------------------------

DEFINE TABLE IF NOT EXISTS websites TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select, update, delete, create WHERE owner = $auth.id OR $auth.id IN users;

DEFINE FIELD IF NOT EXISTS created_at ON websites TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS description ON websites TYPE string;
DEFINE FIELD IF NOT EXISTS owner ON websites TYPE record<users> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS url ON websites TYPE string ASSERT string::is_url($value);
DEFINE FIELD IF NOT EXISTS users ON websites TYPE array<record<users>>;
DEFINE FIELD IF NOT EXISTS verified ON websites TYPE bool DEFAULT false;

DEFINE INDEX IF NOT EXISTS url_idx ON websites FIELDS url UNIQUE;
DEFINE INDEX IF NOT EXISTS owner_websites_idx ON websites FIELDS owner;
DEFINE INDEX IF NOT EXISTS users_websites_idx ON websites FIELDS users;

DEFINE EVENT IF NOT EXISTS website_delete ON websites WHEN $event = 'DELETE' THEN { DELETE jobs WHERE website = $before.id };


-- ------------------------------
-- TABLE: jobs
-- ------------------------------

DEFINE TABLE IF NOT EXISTS jobs TYPE NORMAL SCHEMAFULL PERMISSIONS FOR delete NONE, FOR select, update, create WHERE website.owner = $auth.id OR $auth.id IN website.users;

DEFINE FIELD IF NOT EXISTS created_at ON jobs TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE options ON jobs TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE status ON jobs TYPE string DEFAULT 'pending' ASSERT ['pending', 'processing', 'completed', 'failed'].includes($value);
DEFINE FIELD OVERWRITE types ON jobs TYPE array<string> DEFAULT ['probe'] ASSERT !array::is_empty(array::intersect($value, ['probe', 'seo', 'ssl', 'wcag', 'whois', 'domain', 'security', 'stress']));
DEFINE FIELD IF NOT EXISTS types.* ON jobs TYPE string;
DEFINE FIELD IF NOT EXISTS website ON jobs TYPE record<websites> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS probe ON jobs TYPE option<record<probe_results>>;
DEFINE FIELD IF NOT EXISTS seo ON jobs TYPE option<record<seo_results>>;
DEFINE FIELD IF NOT EXISTS ssl ON jobs TYPE option<record<ssl_results>>;
DEFINE FIELD IF NOT EXISTS whois ON jobs TYPE option<array<record<whois_results>>>;
DEFINE FIELD IF NOT EXISTS wcag ON jobs TYPE option<array<record<wcag_results>>>;
DEFINE FIELD IF NOT EXISTS domain ON jobs TYPE option<record<domain_results>>;
DEFINE FIELD IF NOT EXISTS security ON jobs TYPE option<record<security_results>>;
DEFINE FIELD IF NOT EXISTS stress ON jobs TYPE option<record<stress_results>>;

DEFINE INDEX IF NOT EXISTS job_date ON jobs FIELDS created_at;
DEFINE INDEX IF NOT EXISTS job_status_idx ON jobs FIELDS status;
DEFINE INDEX IF NOT EXISTS job_types_idx ON jobs FIELDS types;
DEFINE INDEX IF NOT EXISTS job_website_idx ON jobs FIELDS website;

DEFINE EVENT OVERWRITE job_deletion ON jobs WHEN $event = 'DELETE' THEN {
  IF type::is_array($before.whois) AND !array::is_empty($before.whois) { FOR $item in $before.whois { (DELETE $item) } };
  IF type::is_array($before.wcag) AND !array::is_empty($before.wcag) {
    FOR $item in $before.wcag {
      LET $wcag_result = (SELECT screenshot FROM $item LIMIT 1);
      LET $screenshot = $wcag_result[0].screenshot;
      IF $screenshot AND type::file('screenshots', $screenshot).exists() { type::file('screenshots', $screenshot).delete() };
      (DELETE $item)
    }
  };
  IF $before.ssl { (DELETE $before.ssl) };
  IF $before.seo { (DELETE $before.seo) };
  IF $before.probe { (DELETE $before.probe) };
  IF $before.domain { (DELETE $before.domain) };
  IF $before.security { (DELETE $before.security) };
  IF $before.stress { (DELETE $before.stress) };
  IF type::file('screenshots', record::id($before.id) + '.png').exists() { type::file('screenshots', record::id($before.id) + '.png').delete() };
  DELETE FROM job_queue WHERE job = $before.id;
};

DEFINE EVENT IF NOT EXISTS job_completion_check ON jobs WHEN $event = 'UPDATE' AND $after.status != 'completed' THEN {
    LET $has_pending_wcag = ('wcag' IN $after.types) AND (
        array::len((SELECT id FROM job_queue WHERE job = $after.id AND type = 'wcag' AND status IN ['pending','waiting','processing'])) > 0
    );
    LET $is_incomplete = (
        ('probe' IN $after.types AND $after.probe = NONE) OR
        ('seo' IN $after.types AND $after.seo = NONE) OR
        ('ssl' IN $after.types AND $after.ssl = NONE) OR
        ('wcag' IN $after.types AND ($after.wcag = NONE OR $has_pending_wcag)) OR
        ('whois' IN $after.types AND $after.whois = NONE) OR
        ('domain' IN $after.types AND $after.domain = NONE) OR
        ('security' IN $after.types AND $after.security = NONE) OR
        ('stress' IN $after.types AND $after.stress = NONE)
    );
    IF !$is_incomplete { (UPDATE $after.id SET status = 'completed') };
};


-- ------------------------------
-- TABLE: job_queue
-- ------------------------------

DEFINE TABLE IF NOT EXISTS job_queue TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON job_queue TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS attempts ON job_queue TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS job ON job_queue TYPE record<jobs>;
DEFINE FIELD IF NOT EXISTS next_run_at ON job_queue TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE options ON job_queue TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE type ON job_queue TYPE string ASSERT $value IN ['seo', 'ssl', 'wcag', 'whois', 'domain', 'security', 'stress'];
DEFINE FIELD OVERWRITE status ON job_queue TYPE string DEFAULT 'pending' ASSERT $value IN ['pending', 'waiting', 'processing', 'completed', 'failed', 'canceled'];
DEFINE FIELD IF NOT EXISTS target ON job_queue TYPE string;

DEFINE EVENT IF NOT EXISTS job_queue_cancel ON job_queue WHEN $event = 'UPDATE' AND $before.status != 'canceled' AND $after.status = 'canceled' THEN {
    UPDATE jobs SET status = 'failed' WHERE id = $after.job AND status != 'completed';
};


-- ------------------------------
-- TABLE: probe_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS probe_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD OVERWRITE cdn ON probe_results TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS created_at ON probe_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS favicon ON probe_results TYPE string | NULL;
DEFINE FIELD IF NOT EXISTS ipv4 ON probe_results TYPE option<array<option<string>>>;
DEFINE FIELD IF NOT EXISTS ipv4.* ON probe_results TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ipv6 ON probe_results TYPE option<array<option<string>>>;
DEFINE FIELD IF NOT EXISTS ipv6.* ON probe_results TYPE option<string>;
DEFINE FIELD IF NOT EXISTS job ON probe_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD OVERWRITE response_time ON probe_results TYPE string;
DEFINE FIELD IF NOT EXISTS secure ON probe_results TYPE bool;
DEFINE FIELD IF NOT EXISTS server ON probe_results TYPE string;
DEFINE FIELD IF NOT EXISTS tech ON probe_results TYPE option<array<option<string>>>;
DEFINE FIELD IF NOT EXISTS tech.* ON probe_results TYPE option<string>;
DEFINE FIELD IF NOT EXISTS title ON probe_results TYPE string;
DEFINE FIELD IF NOT EXISTS wp_plugins ON probe_results TYPE option<array<option<string>>>;
DEFINE FIELD IF NOT EXISTS wp_plugins.* ON probe_results TYPE option<string>;
DEFINE FIELD IF NOT EXISTS wp_themes ON probe_results TYPE option<array<option<string>>>;
DEFINE FIELD IF NOT EXISTS wp_themes.* ON probe_results TYPE option<string>;

DEFINE EVENT IF NOT EXISTS probe_completion ON probe_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET probe = type::record('probe_results', $after.id) WHERE id = $after.job;
};


-- ------------------------------
-- TABLE: seo_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS seo_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON seo_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS errors ON seo_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS job ON seo_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS passes ON seo_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS raw ON seo_results TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS score ON seo_results TYPE number;
DEFINE FIELD IF NOT EXISTS warnings ON seo_results TYPE int DEFAULT 0;

DEFINE EVENT OVERWRITE seo_completion ON seo_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET seo = type::record('seo_results', $after.id) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'seo';
};


-- ------------------------------
-- TABLE: ssl_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS ssl_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON ssl_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS issuer ON ssl_results TYPE object;
DEFINE FIELD IF NOT EXISTS issuer.country ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS issuer.domain ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS issuer.name ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS job ON ssl_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS owner ON ssl_results TYPE object;
DEFINE FIELD IF NOT EXISTS owner.address ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS owner.country ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS owner.domain ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS owner.name ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS protocol ON ssl_results TYPE string;
DEFINE FIELD IF NOT EXISTS valid_from ON ssl_results TYPE datetime;
DEFINE FIELD IF NOT EXISTS valid_to ON ssl_results TYPE datetime;

DEFINE EVENT OVERWRITE ssl_completion ON ssl_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET ssl = type::record('ssl_results', $after.id) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'ssl';
};


-- ------------------------------
-- TABLE: domain_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS domain_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON domain_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS job ON domain_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS domain ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS tld ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS punycodeName ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS unicodeName ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS isIDN ON domain_results TYPE bool;
DEFINE FIELD IF NOT EXISTS registrar ON domain_results TYPE object;
DEFINE FIELD IF NOT EXISTS registrar.name ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS registrar.ianaId ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS registrar.url ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS registrar.email ON domain_results TYPE string | null;
DEFINE FIELD IF NOT EXISTS registrar.phone ON domain_results TYPE string | null;
DEFINE FIELD OVERWRITE statuses ON domain_results TYPE array<string> | [];
DEFINE FIELD IF NOT EXISTS transferLock ON domain_results TYPE bool;
DEFINE FIELD IF NOT EXISTS creationDate ON domain_results TYPE datetime | null;
DEFINE FIELD IF NOT EXISTS updatedDate ON domain_results TYPE datetime | null;
DEFINE FIELD IF NOT EXISTS expirationDate ON domain_results TYPE datetime | null;
DEFINE FIELD IF NOT EXISTS dnssecEnabled ON domain_results TYPE bool;
DEFINE FIELD IF NOT EXISTS privacyEnabled ON domain_results TYPE bool;
DEFINE FIELD OVERWRITE nameservers ON domain_results TYPE array<string> | [];
DEFINE FIELD IF NOT EXISTS records ON domain_results TYPE object FLEXIBLE;

DEFINE EVENT IF NOT EXISTS domain_completion ON domain_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET domain = type::record('domain_results', $after.id) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'domain';
};


-- ------------------------------
-- TABLE: security_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS security_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON security_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS errors ON security_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS job ON security_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS passes ON security_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS raw ON security_results TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS score ON security_results TYPE number;
DEFINE FIELD IF NOT EXISTS warnings ON security_results TYPE int DEFAULT 0;

DEFINE EVENT IF NOT EXISTS security_completion ON security_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET security = type::record('security_results', $after.id) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'security';
};


-- ------------------------------
-- TABLE: stress_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS stress_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON stress_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS errors ON stress_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS job ON stress_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS passes ON stress_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS raw ON stress_results TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS score ON stress_results TYPE number;
DEFINE FIELD IF NOT EXISTS warnings ON stress_results TYPE int DEFAULT 0;

DEFINE EVENT IF NOT EXISTS stress_completion ON stress_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET stress = type::record('stress_results', $after.id) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'stress';
};


-- ------------------------------
-- TABLE: wcag_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS wcag_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS created_at ON wcag_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS device ON wcag_results TYPE string;
DEFINE FIELD IF NOT EXISTS errors ON wcag_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS job ON wcag_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS passes ON wcag_results TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS raw ON wcag_results TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS score ON wcag_results TYPE number;
DEFINE FIELD IF NOT EXISTS screenshot ON wcag_results TYPE string;
DEFINE FIELD IF NOT EXISTS warnings ON wcag_results TYPE int DEFAULT 0;

DEFINE EVENT IF NOT EXISTS wcag_completion ON wcag_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET wcag = array::add(wcag || [], type::record('wcag_results', $after.id)) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'wcag' AND target = $after.device;
};


-- ------------------------------
-- TABLE: whois_results
-- ------------------------------

DEFINE TABLE IF NOT EXISTS whois_results TYPE NORMAL SCHEMAFULL PERMISSIONS FOR create, update, delete NONE, FOR select WHERE job.website.owner = $auth.id OR $auth.id IN job.website.users;

DEFINE FIELD IF NOT EXISTS as ON whois_results TYPE int;
DEFINE FIELD IF NOT EXISTS country ON whois_results TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON whois_results TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS date ON whois_results TYPE datetime;
DEFINE FIELD IF NOT EXISTS ip ON whois_results TYPE string;
DEFINE FIELD IF NOT EXISTS job ON whois_results TYPE record<jobs> ASSERT record::exists($value);
DEFINE FIELD IF NOT EXISTS name ON whois_results TYPE string;
DEFINE FIELD IF NOT EXISTS network ON whois_results TYPE string;
DEFINE FIELD IF NOT EXISTS registry ON whois_results TYPE string;

DEFINE EVENT IF NOT EXISTS whois_completion ON whois_results WHEN $event = 'CREATE' THEN {
	UPDATE jobs SET whois = array::add(whois || [], type::record('whois_results', $after.id)) WHERE id = $after.job;
	UPDATE job_queue SET status = 'completed' WHERE job = $after.job AND type = 'whois' AND target = $after.ip;
};
