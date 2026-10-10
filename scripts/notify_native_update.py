"""Send the native change bundle to the configured developer-channel webhook."""

import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
import uuid

ROLE = "1558343429077868645"
CHANNEL = "1504149536891867207"


def send(directory):
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not webhook:
        print("Developer webhook is not configured; changed resources remain in Actions artifacts.")
        return
    parsed = urllib.parse.urlsplit(webhook)
    if parsed.scheme != "https" or parsed.hostname not in ("discord.com", "discordapp.com"):
        raise ValueError("Expected a Discord HTTPS webhook")
    with urllib.request.urlopen(webhook, timeout=30) as response:
        info = json.load(response)
    if info.get("channel_id") != CHANNEL:
        raise ValueError("Webhook does not belong to the configured developer channel")
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    if not summary["changed"]:
        return
    review = (directory / "pr-url.txt").read_text(encoding="utf-8").strip()
    names = "\n".join("- " + item["path"] for item in summary["changes"])
    content = (f"<@&{ROLE}> Used Deadlock resources changed.\n{review}\n"
               "XML overrides require review; this is not a compiled mod update.\n" + names)
    if len(content) > 1700:
        content = content[:1600] + "\nFull list is in the review report."
    bundle = directory / "changed-resources.zip"
    payload = {"content": content, "allowed_mentions": {"parse": [], "roles": [ROLE]}}
    if bundle.stat().st_size > 9 * 1024 * 1024:
        payload["content"] += "\nChanged-file bundle: " + os.environ["RUN_URL"]
        body = json.dumps(payload).encode()
        content_type = "application/json"
    else:
        boundary = uuid.uuid4().hex
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
                "Content-Type: application/json\r\n\r\n").encode() + json.dumps(payload).encode()
        body += (f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; "
                 "filename=\"changed-resources.zip\"\r\nContent-Type: application/zip\r\n\r\n").encode()
        body += bundle.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
        content_type = "multipart/form-data; boundary=" + boundary
    query = urllib.parse.parse_qsl(parsed.query)
    query = [(key, value) for key, value in query if key != "wait"] + [("wait", "true")]
    url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))
    request = urllib.request.Request(url, data=body, headers={"Content-Type": content_type}, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:
        message = json.load(response)
    if message.get("channel_id") != CHANNEL or not message.get("id"):
        raise ValueError("Discord did not acknowledge developer-channel delivery")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as outputs:
            outputs.write("sent=true\n")
    print("Developer-channel delivery acknowledged: " + message["id"])


if __name__ == "__main__":
    send(Path(".upstream-review"))
