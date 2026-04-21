<p align="center">
  <img src="public/shared/images/cinerr-logo-dark-ext.svg" alt="Cinerr" width="300">
</p>

<p align="center">
  Media file manager for self-hosters. See what's in your library, clean it up, keep it organized.
</p>

<p align="center">
  <a href="https://alexkouzel.github.io/cinerr/landing/">Website</a>
  &nbsp;•&nbsp;
  <a href="https://alexkouzel.github.io/cinerr/demo/">Try Demo</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/alexkouzel/cinerr" alt="License"></a>
  <a href="https://github.com/alexkouzel/cinerr/actions/workflows/test.yml"><img src="https://github.com/alexkouzel/cinerr/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://hub.docker.com/r/alexkouzel/cinerr"><img src="https://img.shields.io/docker/pulls/alexkouzel/cinerr" alt="Docker Pulls"></a>
</p>

<p align="center">
Whether you download manually, rip your own discs, or run the full arr stack, once files land in your library, nobody tells you what's actually inside them. Which files are bloated. Which have audio tracks you never wanted. Which are wasting space.<br><br>
Cinerr fills that gap.
</p>

<p align="center">
  <img src="public/shared/images/cinerr-ss-stats-full.png" alt="Cinerr stats dashboard" width="800">
</p>

## Features

- **Stats Dashboard** - Codecs, resolutions, HDR formats, audio formats, and estimated space savings from transcoding, all in one view.
- **Media Browser** - Per-file metadata in a searchable, filterable table.
- **Smart Scanning** - Per-file caching that makes every rescan nearly instant.
- **Live Progress** - Pause, resume, or abort long-running jobs like scans at any time.

## Quick Start
```yaml
services:
  cinerr:
    image: alexkouzel/cinerr:latest
    container_name: cinerr
    ports:
      - "8080:8080"
    volumes:
      - /path/to/your/media:/media:ro
      - cinerr_data:/data
    restart: unless-stopped

volumes:
  cinerr_data:
```

1. Replace `/path/to/your/media` with your media directory.
2. Run `docker compose up -d`
3. Open `localhost:8080` and click `SCAN MEDIA`.

Your media is mounted read-only. Cinerr never touches your files.

## Running Locally

**Prerequisites:** Python 3.12+, `mediainfo` installed on your system
```bash
# Clone the repo
git clone https://github.com/alexkouzel/cinerr.git
cd cinerr

# Create a virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit the environment file
cp env.example.bash env.bash

# Run the server
./run.bash
```

Open `http://localhost:8080`.

## Configuration

Cinerr is configured via environment variables. When running locally, set them in `env.bash`. When running in Docker, pass them with `-e` or a compose `environment:` block.

| Variable    | Default   | Description                                        |
| ----------- | --------- | -------------------------------------------------- |
| `MEDIA_DIR` | `/media`  | Path to your media library (mounted read-only).    |
| `DATA_DIR`  | `/data`   | Where Cinerr stores its cache and scan results.    |
| `PORT`      | `8080`    | Port the server listens on.                        |
| `DEBUG`     | `false`   | Show debug buttons in the action bar.              |

## Running Tests

Backend tests (Python 3.12+):
```bash
pip install pytest
python -m pytest tests/backend/ -v
```

Frontend tests (Node 20+, no dependencies):
```bash
node --test tests/public/
```

## License

Cinerr is licensed under the [Apache License 2.0](LICENSE).
