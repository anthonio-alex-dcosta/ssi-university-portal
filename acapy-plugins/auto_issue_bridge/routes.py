"""Send a pre-registered credential offer the instant a connection goes
active, using the connection's resolved recipient key as reply_to_verkey so
delivery can use ACA-Py's open-session return-route path instead of the
endpoint-based outbound path (which mobile wallets fail, since they have no
public inbound endpoint at all).

This runs *inside* ACA-Py's own event bus dispatch for the
connection-completed event, which fires synchronously as part of processing
the wallet's own "complete" message — unlike an external webhook (a separate,
decoupled notification), this handler runs before that message's inbound
session has a chance to close.

DID Exchange (RFC 23) records land as state "completed"; the older
Connections protocol (RFC 160) uses "active". Issuance invitations in this
project request didexchange/1.0, so we must subscribe to both topics or the
offer is never sent and the phone wallet stays empty after a successful
connection toast.
"""

import json
import logging
import os
import re

from acapy_agent.connections.base_manager import BaseConnectionManager
from acapy_agent.core.event_bus import Event, EventBus
from acapy_agent.core.profile import Profile
from acapy_agent.messaging.responder import BaseResponder
from acapy_agent.protocols.issue_credential.v2_0.routes import _create_free_offer

LOGGER = logging.getLogger(__name__)

PENDING_DIR = "/shared/pending"

# Match both RFC160 ("active") and RFC23/didexchange ("completed").
_CONNECTION_READY = re.compile(
    r"^acapy::record::connections::(active|completed)$"
)


def register_events(event_bus: EventBus):
    """Register to handle events."""
    event_bus.subscribe(_CONNECTION_READY, on_connection_active)
    LOGGER.info(
        "auto_issue_bridge: subscribed to connections active|completed events"
    )


async def on_connection_active(profile: Profile, event: Event):
    """Handle a connection becoming active."""
    connection = event.payload or {}
    connection_id = connection.get("connection_id")
    invitation_msg_id = connection.get("invitation_msg_id")
    LOGGER.info(
        "auto_issue_bridge: connection ready topic=%s connection_id=%s "
        "invitation_msg_id=%s",
        getattr(event, "topic", None),
        connection_id,
        invitation_msg_id,
    )
    if not connection_id or not invitation_msg_id:
        LOGGER.warning(
            "auto_issue_bridge: missing connection_id or invitation_msg_id; "
            "cannot match pending issuance"
        )
        return

    pending_path = os.path.join(PENDING_DIR, f"{invitation_msg_id}.json")
    if not os.path.exists(pending_path):
        LOGGER.info(
            "auto_issue_bridge: no pending issuance file for %s (ignoring)",
            invitation_msg_id,
        )
        return

    try:
        with open(pending_path) as f:
            data = json.load(f)
        os.remove(pending_path)
    except Exception:
        LOGGER.exception("auto_issue_bridge: failed to read pending issuance file")
        return

    try:
        conn_mgr = BaseConnectionManager(profile)
        targets = await conn_mgr.get_connection_targets(connection_id=connection_id)
        reply_to_verkey = None
        if targets and targets[0].recipient_keys:
            reply_to_verkey = targets[0].recipient_keys[0]

        preview_spec = {
            "@type": "issue-credential/2.0/credential-preview",
            "attributes": [
                {"name": k, "value": str(v)} for k, v in data["studentData"].items()
            ],
        }

        _cred_ex_record, cred_offer_message = await _create_free_offer(
            profile=profile,
            filt_spec={"indy": {"cred_def_id": data["credDefId"]}},
            connection_id=connection_id,
            auto_issue=True,
            auto_remove=False,
            preview_spec=preview_spec,
            comment="Login",
        )

        responder = profile.inject(BaseResponder)
        send_kwargs = {"connection_id": connection_id}
        if reply_to_verkey:
            send_kwargs["reply_to_verkey"] = reply_to_verkey
        await responder.send(cred_offer_message, **send_kwargs)
        LOGGER.info(
            "auto_issue_bridge: sent credential offer for %s over connection %s "
            "(reply_to_verkey=%s)",
            invitation_msg_id,
            connection_id,
            bool(reply_to_verkey),
        )
    except Exception:
        LOGGER.exception("auto_issue_bridge: failed to send credential offer")
