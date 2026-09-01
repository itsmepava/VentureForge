import os, json, base64, gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

def get_client():
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise RuntimeError(
            "GOOGLE_SERVICE_ACCOUNT_JSON is missing. "
            "Create a Google service account, share the spreadsheet with it, "
            "and place the service-account JSON in this environment variable."
        )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = json.loads(base64.b64decode(raw).decode("utf-8"))
    creds = Credentials.from_service_account_info(data, scopes=SCOPES)
    return gspread.authorize(creds)

def get_worksheets(spreadsheet_id, sourcing_tab, control_tab, partner_candidates):
    gc = get_client()
    sh = gc.open_by_key(spreadsheet_id)

    try:
        sourcing_ws = sh.worksheet(sourcing_tab)
    except gspread.exceptions.WorksheetNotFound:
        raise RuntimeError(
            f"Worksheet '{sourcing_tab}' not found. "
            f"Available tabs: {[w.title for w in sh.worksheets()]}"
        )

    partner_ws = None
    partner_name = None
    for name in partner_candidates:
        try:
            partner_ws = sh.worksheet(name)
            partner_name = name
            break
        except gspread.exceptions.WorksheetNotFound:
            pass

    if partner_ws is None:
        raise RuntimeError(
            f"Partner worksheet not found. Tried: {list(partner_candidates)}"
        )

    try:
        control_ws = sh.worksheet(control_tab)
    except gspread.exceptions.WorksheetNotFound:
        control_ws = sh.add_worksheet(title=control_tab, rows=1000, cols=10)
        control_ws.update("A1:D1", [[
            "Partner Name", "Last Sourced UTC", "Run Count", "Last Run Added"
        ]])

    return sh, sourcing_ws, partner_ws, control_ws, partner_name
