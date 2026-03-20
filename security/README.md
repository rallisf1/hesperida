This is a rewrite based on https://github.com/BruceWy4ne/web-vuln-scanner

# notes

## risk_level

- info
- low
- medium
- high
- critical

## get nuclei templates db

https://nuclei-templates.netlify.app/db.json.gz

check https://api.github.com/repos/projectdiscovery/nuclei-templates/releases/latest  .tag_name
against the db.json .version, if the github is newer re-download