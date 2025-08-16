CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`client_name` text NOT NULL,
	`application_type` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`grant_types` text NOT NULL,
	`response_types` text NOT NULL,
	`token_endpoint_auth_method` text NOT NULL,
	`scopes` text NOT NULL,
	`require_auth_time` integer DEFAULT false,
	`default_max_age` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

-- Create unique index on client_id
CREATE UNIQUE INDEX `oauth_clients_client_id_unique` ON `oauth_clients` (`client_id`);

-- Insert default iOS client
INSERT INTO `oauth_clients` (
    `id`,
    `client_id`,
    `client_secret`,
    `client_name`,
    `application_type`,
    `redirect_uris`,
    `grant_types`,
    `response_types`,
    `token_endpoint_auth_method`,
    `scopes`,
    `require_auth_time`,
    `default_max_age`,
    `active`,
    `created_at`,
    `updated_at`
) VALUES (
    'hamrah_ios_default',
    'hamrah-ios-app',
    NULL,
    'Hamrah iOS Application',
    'native',
    '["hamrah://auth/callback"]',
    '["authorization_code", "refresh_token"]',
    '["code"]',
    'none',
    '["openid", "profile", "email"]',
    1,
    3600,
    1,
    strftime('%s', 'now'),
    strftime('%s', 'now')
);