import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.request import Request, urlopen

BASE = 'https://api.jolpi.ca/ergast/f1/'
PARTS = [('drivers', 'current/driverStandings.json?limit=100'), ('teams', 'current/constructorStandings.json?limit=100'),
         ('last', 'current/last/results.json?limit=100'), ('next', 'current/next.json'), ('schedule', 'current.json?limit=40')]


def _read(path):
    try:
        with urlopen(Request(BASE + path, headers={'User-Agent': 'MatchLab/1.0', 'Accept': 'application/json'}), timeout=8) as response:
            return json.load(response)['MRData']
    except (OSError, ValueError, KeyError):
        return None


def fetch():
    with ThreadPoolExecutor(max_workers=len(PARTS)) as pool:
        data = list(pool.map(lambda part: _read(part[1]), PARTS))
    result = {name: data[i] for i, (name, _) in enumerate(PARTS)}
    result['checked_at'] = datetime.now(timezone.utc).isoformat()
    return result


if __name__ == '__main__':
    print(json.dumps(fetch()))
