Based on https://github.com/BruceWy4ne/web-vuln-scanner

## risk level score

- info = 0
- low = 1
- medium = 3
- high = 7
- critical = 10

## get nuclei templates db

https://nuclei-templates.netlify.app/db.json.gz

check https://api.github.com/repos/projectdiscovery/nuclei-templates/releases/latest  .tag_name
against the db.json .version, if the github is newer re-download
