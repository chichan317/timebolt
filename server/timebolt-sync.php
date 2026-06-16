<?php
/**
 * TimeBolt sync server — a single self-hosted file.
 *
 * Stores one user's TimeBolt dataset in a flat JSON file next to this script
 * and lets the app pull/push it from any device. No database required.
 *
 * SETUP (see server/README.md):
 *   1. Set TIMEBOLT_TOKEN below to a long private password.
 *   2. Upload this file (and the .htaccess) to your web space.
 *   3. In TimeBolt → Settings → Sync, enter the file URL + the same token.
 *
 * The token is what protects your data. Keep it secret.
 */

// ---- configuration --------------------------------------------------------

/** CHANGE THIS to a long random secret, e.g. 30+ random characters. */
const TIMEBOLT_TOKEN = 'CHANGE-ME-to-a-long-random-secret';

/**
 * Data file lives beside this script. It is given a `.php` extension and a
 * leading `<?php exit;` guard, so if anyone opens it directly in a browser PHP
 * runs the guard and returns nothing — the data is never served. (The optional
 * .htaccess is extra defense, but this works even where .htaccess is ignored.)
 */
const DATA_FILE = __DIR__ . '/timebolt-data.store.php';
const DATA_GUARD = "<?php exit; ?>\n";

// ---- CORS -----------------------------------------------------------------
// The bearer token (not the origin) is what secures the data, so origin is
// permissive to keep cross-origin setup (GitHub Pages → your domain) simple.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: X-Timebolt-Token, Authorization, Content-Type');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// ---- helpers --------------------------------------------------------------

function send($code, $body) {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

/**
 * Read the token. Primary: the X-Timebolt-Token header (survives FastCGI hosts
 * like SiteGround that strip Authorization). Fallbacks: Authorization: Bearer,
 * then a ?token= query param (last resort for awkward hosts).
 */
function read_token() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $lower = [];
    foreach ($headers as $k => $v) $lower[strtolower($k)] = $v;

    if (isset($_SERVER['HTTP_X_TIMEBOLT_TOKEN'])) return trim($_SERVER['HTTP_X_TIMEBOLT_TOKEN']);
    if (isset($lower['x-timebolt-token'])) return trim($lower['x-timebolt-token']);

    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($lower['authorization'] ?? '');
    if (stripos($auth, 'Bearer ') === 0) return trim(substr($auth, 7));

    if (isset($_GET['token'])) return trim($_GET['token']);
    return '';
}

/** Read the stored document, or an empty one if nothing saved yet. */
function read_doc() {
    if (!file_exists(DATA_FILE)) {
        return ['version' => 0, 'updatedAt' => 0, 'payload' => null];
    }
    $raw = file_get_contents(DATA_FILE);
    // Strip the leading PHP guard line (see DATA_GUARD) before parsing.
    if (strncmp($raw, '<?php', 5) === 0) {
        $nl = strpos($raw, "\n");
        $raw = $nl === false ? '' : substr($raw, $nl + 1);
    }
    $doc = json_decode($raw, true);
    if (!is_array($doc) || !isset($doc['version'])) {
        return ['version' => 0, 'updatedAt' => 0, 'payload' => null];
    }
    return $doc;
}

function write_doc($doc) {
    $fp = fopen(DATA_FILE, 'c+');
    if ($fp === false) send(500, ['error' => 'Cannot open data file for writing.']);
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, DATA_GUARD . json_encode($doc));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

// ---- auth -----------------------------------------------------------------

if (TIMEBOLT_TOKEN === 'CHANGE-ME-to-a-long-random-secret') {
    send(500, ['error' => 'Server not configured: set TIMEBOLT_TOKEN in timebolt-sync.php.']);
}
if (!hash_equals(TIMEBOLT_TOKEN, read_token())) {
    send(401, ['error' => 'Unauthorized: wrong or missing token.']);
}

// ---- routing --------------------------------------------------------------

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'status') {
    $doc = read_doc();
    send(200, ['version' => $doc['version'], 'updatedAt' => $doc['updatedAt']]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'pull') {
    send(200, read_doc());
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'push') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || !array_key_exists('payload', $body)) {
        send(400, ['error' => 'Missing payload.']);
    }
    $base = isset($body['baseVersion']) ? (int) $body['baseVersion'] : 0;
    $updatedAt = isset($body['updatedAt']) ? (int) $body['updatedAt'] : 0;

    $doc = read_doc();
    // Optimistic concurrency: if the server moved on since the client's last
    // sync, don't clobber — hand back the current server doc to resolve.
    if ($doc['version'] !== 0 && $base !== $doc['version']) {
        send(409, $doc);
    }
    $next = [
        'version' => $doc['version'] + 1,
        'updatedAt' => $updatedAt > 0 ? $updatedAt : (int) round(microtime(true) * 1000),
        'payload' => $body['payload'],
    ];
    write_doc($next);
    send(200, ['version' => $next['version'], 'updatedAt' => $next['updatedAt']]);
}

send(404, ['error' => 'Unknown action.']);
