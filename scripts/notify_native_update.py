"""Send a role mention and native-resource review link, without attachments."""

import json
import os
from pathlib import Path
import urllib.parse
import urllib.error
import urllib.request

ROLE = "1558343429077868645"
CHANNEL = "1504149536891867207"
USER_AGENT = "DiscordBot (https://github.com/civo7/QOLLOCK, native-updater)"


def request_json(url, payload=None):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never include the secret webhook URL or response text in Actions logs.
        raise RuntimeError(f"Discord rejected the webhook request (HTTP {error.code}); "
                           "notification remains unacknowledged") from None
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Discord webhook transport failed; notification remains unacknowledged") from None


def send(directory):
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not webhook:
        print("Developer webhook is not configured; the review remains available in GitHub.")
        return
    parsed = urllib.parse.urlsplit(webhook)
    if parsed.scheme != "https" or parsed.hostname not in ("discord.com", "discordapp.com"):
        raise ValueError("Expected a Discord HTTPS webhook")
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    if not summary["changed"]:
        return
    info = request_json(webhook)
    if info.get("channel_id") != CHANNEL:
        raise ValueError("Webhook does not belong to the configured developer channel")
    review = (directory / "pr-url.txt").read_text(encoding="utf-8").strip()
    names = "\n".join("- " + item["path"] for item in summary["changes"])
    content = (f"<@&{ROLE}> Used Deadlock resources changed.\n{review}\n"
               "XML overrides require review; this is not a compiled mod update.\n" + names)
    if len(content) > 1700:
        content = content[:1600] + "\nFull list is in the review report."
    payload = {"content": content, "allowed_mentions": {"parse": [], "roles": [ROLE]}}
    query = urllib.parse.parse_qsl(parsed.query)
    query = [(key, value) for key, value in query if key != "wait"] + [("wait", "true")]
    url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))
    message = request_json(url, payload)
    if message.get("channel_id") != CHANNEL or not message.get("id"):
        raise ValueError("Discord did not acknowledge developer-channel delivery")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as outputs:
            outputs.write("sent=true\n")
    print("Developer-channel delivery acknowledged: " + message["id"])


if __name__ == "__main__":
    send(Path(".upstream-review"))
