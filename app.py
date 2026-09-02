import textwrap
from dotenv import load_dotenv
import os
import json
from datetime import datetime, timezone
from pathlib import Path

import streamlit as st

import database
from auth import require_login
from config import settings, ELIGIBLE_COUNTRIES
from google_sheets import get_worksheets
from sourcing_engine import run_sourcing


# ============================================================================
# APP PATHS
# ============================================================================

BASE_DIR = Path(__file__).resolve().parent
LOGO_PATH = BASE_DIR / "assets" / "nventures_logo.png"
ENV_PATH = BASE_DIR / ".env"


# ============================================================================
# ENVIRONMENT
# ============================================================================

load_dotenv(
    dotenv_path=ENV_PATH,
    override=True,
)


# ============================================================================
# PAGE CONFIG
# ============================================================================

st.set_page_config(
    page_title="nVentures Sourcing",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ============================================================================
# HTML HELPER
# ----------------------------------------------------------------------------
# IMPORTANT: Streamlit's st.markdown() runs your string through a Markdown
# parser BEFORE it applies unsafe_allow_html. Markdown treats any line
# indented by 4+ spaces as a preformatted code block, so an HTML string
# written with the same indentation as your surrounding Python code gets
# displayed as literal text instead of being rendered. textwrap.dedent()
# strips that common leading whitespace so Markdown sees it as normal text
# and correctly hands the tags off to the HTML renderer. ALWAYS use this
# helper (not st.markdown directly) for any HTML you add later.
# ============================================================================

def html(content: str) -> None:
    st.markdown(textwrap.dedent(content), unsafe_allow_html=True)


# ============================================================================
# DARK UI / BRAND STYLING
# ============================================================================

html(
    """
    <style>

    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');

    /* ================================================================
       DESIGN TOKENS
       ================================================================
       Background carries a faint blue cast rather than flat near-black,
       so it reads as intentional rather than a default dark theme.
       The brand blue is reserved for exactly two jobs: the primary
       button and the single accent panel border. Everything else stays
       quiet (hairline borders, no shadows) so those two things read as
       deliberate, not decorative repetition.
       ================================================================ */

    :root {
        --nv-bg: #0A0C10;
        --nv-panel: #12151B;
        --nv-panel-quiet: #0E1116;
        --nv-line: #23272F;
        --nv-text: #EDEFF3;
        --nv-text-dim: #8B93A1;
        --nv-accent: #2F6FED;
        --nv-accent-soft: #1A2740;
        --nv-good: #3FBF7F;
        --nv-bad: #E5604D;
    }

    .stApp {
        background: var(--nv-bg);
        color: var(--nv-text);
    }

    [data-testid="stAppViewContainer"] {
        background: var(--nv-bg);
    }

    [data-testid="stHeader"] {
        background: transparent;
    }

    #MainMenu, footer {
        visibility: hidden;
    }


    /* ================================================================
       TYPOGRAPHY
       ================================================================ */

    h1, h2, h3, h4 {
        font-family: 'Space Grotesk', sans-serif;
        color: var(--nv-text) !important;
        letter-spacing: -0.01em;
        font-weight: 600;
    }

    p, span, label, .stMarkdown {
        color: var(--nv-text);
    }

    .stCaption {
        color: var(--nv-text-dim) !important;
    }


    /* ================================================================
       SIDEBAR
       ================================================================ */

    section[data-testid="stSidebar"] {
        background: var(--nv-panel-quiet);
        border-right: 1px solid var(--nv-line);
    }

    section[data-testid="stSidebar"] > div {
        background: var(--nv-panel-quiet);
    }

    section[data-testid="stSidebar"] * {
        color: var(--nv-text);
    }


    /* ================================================================
       HERO
       ----------------------------------------------------------------
       This is the one bold element on the page. Larger type, a subtle
       gradient wash instead of a flat card, and a thin accent rule on
       the left edge instead of a full border everywhere.
       ================================================================ */

    .nv-hero {
        position: relative;
        background:
            radial-gradient(ellipse at top left, var(--nv-accent-soft), transparent 60%),
            var(--nv-panel);
        border: 1px solid var(--nv-line);
        border-left: 3px solid var(--nv-accent);
        border-radius: 4px;
        padding: 40px 40px 36px 38px;
        margin-bottom: 28px;
    }

    .nv-hero-title {
        font-family: 'Space Grotesk', sans-serif;
        color: #FFFFFF !important;
        font-size: 40px;
        font-weight: 700;
        margin: 0;
        line-height: 1.1;
    }

    .nv-hero-subtitle {
        color: var(--nv-text-dim) !important;
        font-size: 15px;
        margin-top: 12px;
        max-width: 620px;
        line-height: 1.55;
    }


    /* ================================================================
       GEOGRAPHIC FOCUS
       ----------------------------------------------------------------
       Deliberately quieter than the hero: no gradient, thin border,
       clean type for the country list to read as fixed reference data
       rather than prose.
       ================================================================ */

    .nv-focus {
        background: var(--nv-panel-quiet);
        border: 1px solid var(--nv-line);
        border-radius: 4px;
        padding: 20px 22px;
        margin: 4px 0 26px 0;
    }

    .nv-focus-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--nv-text);
        margin-bottom: 4px;
    }

    .nv-focus-main {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 20px;
        font-weight: 600;
        color: #FFFFFF !important;
        margin-top: 4px;
    }

    .nv-focus-text {
        font-size: 13px;
        color: var(--nv-text-dim) !important;
        margin-top: 8px;
        line-height: 1.6;
    }


    /* ================================================================
       METRICS
       ================================================================ */

    div[data-testid="stMetric"] {
        background: var(--nv-panel);
        border: 1px solid var(--nv-line);
        border-radius: 4px;
        padding: 16px 18px;
    }

    div[data-testid="stMetric"] label {
        color: var(--nv-text-dim) !important;
        font-size: 12px;
    }

    div[data-testid="stMetric"] [data-testid="stMetricValue"] {
        font-family: 'Space Grotesk', sans-serif;
        color: #FFFFFF !important;
    }


    /* ================================================================
       INPUTS
       ================================================================ */

    div[data-baseweb="input"],
    div[data-baseweb="textarea"],
    div[data-testid="stNumberInput"] > div {
        background: var(--nv-panel);
        border: 1px solid var(--nv-line) !important;
        border-radius: 4px;
    }

    div[data-baseweb="input"] input,
    div[data-baseweb="textarea"] textarea,
    div[data-testid="stNumberInput"] input {
        color: var(--nv-text) !important;
    }

    div[data-baseweb="select"] > div {
        background: var(--nv-panel);
        border-color: var(--nv-line);
        color: var(--nv-text);
        border-radius: 4px;
    }


    /* ================================================================
       BUTTONS
       ----------------------------------------------------------------
       Accent blue is reserved for the primary action only.
       ================================================================ */

    .stButton > button {
        background: var(--nv-panel);
        color: var(--nv-text);
        border: 1px solid var(--nv-line);
        border-radius: 4px;
        font-weight: 500;
        min-height: 42px;
    }

    .stButton > button:hover {
        border-color: var(--nv-accent);
        color: #FFFFFF;
    }

    .stButton > button[kind="primary"] {
        background: var(--nv-accent);
        border: 1px solid var(--nv-accent);
        color: #FFFFFF;
        font-weight: 600;
        border-radius: 4px;
        min-height: 48px;
    }

    .stButton > button[kind="primary"]:hover {
        background: #2560CC;
        border-color: #2560CC;
    }


    /* ================================================================
       ALERTS
       ================================================================ */

    div[data-testid="stAlert"] {
        background: var(--nv-panel);
        border: 1px solid var(--nv-line);
        border-radius: 4px;
        color: var(--nv-text);
    }

    div[data-testid="stAlert"] p {
        color: var(--nv-text) !important;
    }


    /* ================================================================
       EXPANDERS / DATAFRAMES
       ================================================================ */

    div[data-testid="stExpander"],
    div[data-testid="stDataFrame"] {
        background: var(--nv-panel);
        border: 1px solid var(--nv-line);
        border-radius: 4px;
    }

    div[data-testid="stExpander"] summary {
        color: var(--nv-text) !important;
    }


    /* ================================================================
       DIVIDERS
       ================================================================ */

    hr {
        border-color: var(--nv-line) !important;
    }


    /* ================================================================
       SIDEBAR CREDIT
       ================================================================ */

    .nv-credit {
        margin-top: 24px;
        padding: 14px;
        border: 1px solid var(--nv-line);
        border-radius: 4px;
        background: var(--nv-panel);
        text-align: center;
    }

    .nv-credit-small {
        font-size: 11px;
        color: var(--nv-text-dim) !important;
        margin-bottom: 4px;
    }

    .nv-credit-name {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 14px;
        font-weight: 600;
        color: var(--nv-text) !important;
    }

    .nv-credit-product {
        font-size: 11px;
        color: var(--nv-text-dim) !important;
        margin-top: 4px;
    }


    /* ================================================================
       LOGIN
       ================================================================ */

    .nv-login-wrap {
        max-width: 480px;
        margin: 60px auto 0 auto;
        padding: 10px;
    }

    .nv-login-title {
        font-family: 'Space Grotesk', sans-serif;
        text-align: center;
        font-size: 28px;
        font-weight: 600;
        color: #FFFFFF !important;
        margin-top: 18px;
    }

    .nv-login-subtitle {
        text-align: center;
        color: var(--nv-text-dim) !important;
        font-size: 13px;
        margin-bottom: 24px;
    }


    /* ================================================================
       RADIO / CHECKBOX
       ================================================================ */

    [data-testid="stCheckbox"] label,
    [data-testid="stRadio"] label {
        color: var(--nv-text) !important;
    }


    /* ================================================================
       LINKS
       ================================================================ */

    a {
        color: var(--nv-accent) !important;
    }

    </style>
    """
)


# ============================================================================
# DATABASE
# ============================================================================

database.init_db()


# ============================================================================
# ADMIN BOOTSTRAP
# ============================================================================

admin_email = os.getenv(
    "ADMIN_EMAIL",
    "",
).strip().lower()

admin_password = os.getenv(
    "ADMIN_PASSWORD",
    "",
)

if admin_email and admin_password:
    database.ensure_admin(
        admin_email,
        admin_password,
    )


# ============================================================================
# OPTIONAL ADMIN PASSWORD RESET
# ============================================================================

force_reset = os.getenv(
    "ADMIN_FORCE_RESET",
    "",
).strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}

if force_reset and admin_email and admin_password:
    try:
        database.reset_password(
            admin_email,
            admin_password,
        )
    except Exception:
        pass


# ============================================================================
# SESSION STATE
# ============================================================================

if "user" not in st.session_state:
    st.session_state.user = None


# ============================================================================
# LOGIN
# ============================================================================

if not st.session_state.user:

    html('<div class="nv-login-wrap">')

    if LOGO_PATH.is_file():
        st.image(
            str(LOGO_PATH),
            use_container_width=True,
        )
    else:
        html('<div style="text-align:center;"><h1>nVentures</h1></div>')

    html('<div class="nv-login-title">Sourcing Intelligence</div>')

    html(
        '<div class="nv-login-subtitle">'
        'Private sourcing platform for the nVentures team.'
        '</div>'
    )

    with st.form("login_form"):

        email = st.text_input(
            "Email",
            placeholder="you@company.com",
        )

        password = st.text_input(
            "Password",
            type="password",
        )

        submitted = st.form_submit_button(
            "Sign in",
            type="primary",
            use_container_width=True,
        )

    if submitted:

        email_clean = email.strip().lower()

        user = database.authenticate(
            email_clean,
            password,
        )

        if user:
            st.session_state.user = user
            st.rerun()
        else:
            st.error(
                "Invalid email or password."
            )

    html(
        """
        <div style="
            text-align:center;
            color: var(--nv-text-dim);
            font-size:12px;
            margin-top:25px;
        ">
            nVentures Sourcing Platform
        </div>
        """
    )

    html("</div>")

    st.stop()


# ============================================================================
# CURRENT USER
# ============================================================================

user = st.session_state.user


# ============================================================================
# SIDEBAR BRANDING
# ============================================================================

if LOGO_PATH.is_file():
    st.sidebar.image(
        str(LOGO_PATH),
        use_container_width=True,
    )
else:
    st.sidebar.markdown(
        "# nVentures"
    )


# ============================================================================
# SIDEBAR USER INFORMATION
# ============================================================================

st.sidebar.divider()

st.sidebar.caption(
    f"Signed in as {user['email']}"
)

st.sidebar.caption(
    f"Role: {user['role']}"
)


# ============================================================================
# SIGN OUT
# ============================================================================

if st.sidebar.button(
    "Sign out",
    use_container_width=True,
):

    st.session_state.user = None

    st.rerun()


# ============================================================================
# NAVIGATION
# ============================================================================

st.sidebar.divider()

page = st.sidebar.radio(
    "Navigate",
    [
        "Dashboard",
        "Run History",
        "Admin",
    ],
)


# ============================================================================
# SIDEBAR CREDIT
# ============================================================================

html(
    """
    <div class="nv-credit">
        <div class="nv-credit-small">
            Built by
        </div>

        <div class="nv-credit-name">
            Pavara Kekulawala
        </div>

        <div class="nv-credit-product">
            nVentures Sourcing Platform
        </div>
    </div>
    """
)


# ============================================================================
# DASHBOARD
# ============================================================================

if page == "Dashboard":

    html(
        """
        <div class="nv-hero">
            <div class="nv-hero-title">
                Sourcing Intelligence
            </div>
            <div class="nv-hero-subtitle">
                AI-powered company discovery, research and investment sourcing.
            </div>
        </div>
        """
    )


    # ------------------------------------------------------------------------
    # GEOGRAPHIC FOCUS
    # ------------------------------------------------------------------------

    html(
        """
        <div class="nv-focus">
            <div class="nv-focus-title">
                Geographic focus — hard filter
            </div>
            <div class="nv-focus-main">
                South Asia + Singapore
            </div>
            <div class="nv-focus-text">
                Afghanistan, Bangladesh, Bhutan, India, Maldives,
                Nepal, Pakistan, Singapore and Sri Lanka.
            </div>
            <div class="nv-focus-text">
                Companies must be headquartered in an eligible country.
            </div>
        </div>
        """
    )


    # ------------------------------------------------------------------------
    # SOURCING CONTROLS
    # ------------------------------------------------------------------------

    st.markdown(
        "### Sourcing controls"
    )

    c1, c2, c3 = st.columns(3)


    with c1:

        target = st.number_input(
            "Target new companies",
            min_value=1,
            max_value=100,
            value=25,
            step=1,
        )


    with c2:

        max_partners = st.number_input(
            "Partners per run",
            min_value=1,
            max_value=50,
            value=int(settings.max_partners),
            step=1,
        )


    with c3:

        max_research = st.number_input(
            "Deep research limit",
            min_value=1,
            max_value=200,
            value=int(settings.max_deep_research),
            step=1,
        )


    st.divider()


    # ------------------------------------------------------------------------
    # GEOGRAPHIC ELIGIBILITY
    # ------------------------------------------------------------------------

    st.markdown(
        "### Geographic eligibility"
    )

    st.info(
        "Companies must be headquartered in: "
        + ", ".join(ELIGIBLE_COUNTRIES)
    )

    st.warning(
        "This is a hard Python-level filter. "
        "An AI response cannot override the geography rule."
    )


    # ------------------------------------------------------------------------
    # INVESTMENT CRITERIA
    # ------------------------------------------------------------------------

    st.markdown(
        "### Investment criteria"
    )

    st.write(
        f"**B2B:** required &nbsp;&nbsp; "
        f"**Stage:** pre-seed/seed &nbsp;&nbsp; "
        f"**Funding ceiling:** "
        f"${settings.max_total_funding:,.0f}"
    )


    st.divider()


    # ------------------------------------------------------------------------
    # CONNECTION STATUS
    # ------------------------------------------------------------------------

    st.markdown(
        "### System status"
    )

    openrouter_ready = bool(
        os.getenv(
            "OPENROUTER_API_KEY",
            "",
        ).strip()
    )

    tavily_ready = bool(
        os.getenv(
            "TAVILY_API_KEY",
            "",
        ).strip()
    )

    google_ready = bool(
        os.getenv(
            "GOOGLE_SERVICE_ACCOUNT_JSON",
            "",
        ).strip()
    )

    status_col1, status_col2, status_col3 = st.columns(3)


    with status_col1:

        if openrouter_ready:
            st.success(
                "OpenRouter configured"
            )
        else:
            st.error(
                "OpenRouter key missing"
            )


    with status_col2:

        if tavily_ready:
            st.success(
                "Tavily configured"
            )
        else:
            st.error(
                "Tavily key missing"
            )


    with status_col3:

        if google_ready:
            st.success(
                "Google Sheets configured"
            )
        else:
            st.error(
                "Google service account missing"
            )


    st.divider()


    # ------------------------------------------------------------------------
    # START SOURCING
    # ------------------------------------------------------------------------

    if st.button(
        "Start sourcing",
        type="primary",
        use_container_width=True,
    ):

        started = datetime.now(
            timezone.utc
        ).isoformat()

        progress = st.progress(0)
        status = st.empty()


        try:

            # ---------------------------------------------------------------
            # GOOGLE SHEETS
            # ---------------------------------------------------------------

            status.info(
                "Connecting to Google Sheets..."
            )

            (
                sh,
                sourcing_ws,
                partner_ws,
                control_ws,
                partner_name,
            ) = get_worksheets(
                settings.spreadsheet_id,
                settings.sourcing_tab,
                settings.control_tab,
                settings.partner_tab_candidates,
            )

            status.success(
                "Google Sheets connected."
            )


            # ---------------------------------------------------------------
            # PROGRESS CALLBACK
            # ---------------------------------------------------------------

            def on_progress(
                value,
                message="",
            ):

                try:

                    progress.progress(
                        max(
                            0,
                            min(
                                100,
                                int(value),
                            ),
                        )
                    )

                except Exception:
                    pass


                if message:

                    status.write(
                        message
                    )


            # ---------------------------------------------------------------
            # SOURCING ENGINE
            # ---------------------------------------------------------------

            status.info(
                "Starting sourcing engine..."
            )

            report = run_sourcing(
                sourcing_ws=sourcing_ws,
                partner_ws=partner_ws,
                control_ws=control_ws,

                openrouter_api_key=os.getenv(
                    "OPENROUTER_API_KEY",
                    "",
                ),

                tavily_api_key=os.getenv(
                    "TAVILY_API_KEY",
                    "",
                ),

                openrouter_model=settings.openrouter_model,

                target_companies=int(
                    target
                ),

                max_partners=int(
                    max_partners
                ),

                max_deep_research=int(
                    max_research
                ),

                max_candidates_per_partner=(
                    settings.max_candidates_per_partner
                ),

                max_total_funding=(
                    settings.max_total_funding
                ),

                max_team_size_warning=(
                    settings.max_team_size_warning
                ),

                tavily_timeout=(
                    settings.tavily_timeout
                ),

                openrouter_timeout=(
                    settings.openrouter_timeout
                ),

                max_tavily_results=(
                    settings.max_tavily_results
                ),

                max_research_chars=(
                    settings.max_research_chars
                ),

                request_delay=(
                    settings.request_delay
                ),

                progress_callback=on_progress,
            )


            # ---------------------------------------------------------------
            # SAVE RUN
            # ---------------------------------------------------------------

            finished = datetime.now(
                timezone.utc
            ).isoformat()

            run_id = database.save_run(
                user["email"],
                started,
                finished,
                int(target),
                report,
            )

            progress.progress(100)

            status.success(
                f"Run #{run_id} completed."
            )


            # ---------------------------------------------------------------
            # REPORT DATA
            # ---------------------------------------------------------------

            accepted = report.get(
                "accepted",
                [],
            )

            rejected = report.get(
                "rejected",
                [],
            )

            duplicates = report.get(
                "duplicates",
                [],
            )

            errors = report.get(
                "partner_errors",
                [],
            )


            # ---------------------------------------------------------------
            # METRICS
            # ---------------------------------------------------------------

            a, b, c, d = st.columns(4)

            a.metric(
                "Added",
                len(accepted),
            )

            b.metric(
                "Duplicates",
                len(duplicates),
            )

            c.metric(
                "Rejected",
                len(rejected),
            )

            d.metric(
                "Partner errors",
                len(errors),
            )


            # ---------------------------------------------------------------
            # ACCEPTED COMPANIES
            # ---------------------------------------------------------------

            if accepted:

                st.markdown(
                    "### New companies"
                )

                accepted_details = report.get(
                    "accepted_details",
                    accepted,
                )

                st.dataframe(
                    accepted_details,
                    use_container_width=True,
                )

            else:

                st.info(
                    "No new companies were accepted during this run."
                )


            # ---------------------------------------------------------------
            # REJECTED
            # ---------------------------------------------------------------

            if rejected:

                with st.expander(
                    f"Rejected ({len(rejected)})"
                ):

                    st.write(
                        rejected
                    )


            # ---------------------------------------------------------------
            # DUPLICATES
            # ---------------------------------------------------------------

            if duplicates:

                with st.expander(
                    f"Duplicates ({len(duplicates)})"
                ):

                    st.write(
                        duplicates
                    )


            # ---------------------------------------------------------------
            # ERRORS
            # ---------------------------------------------------------------

            if errors:

                with st.expander(
                    f"Partner/API errors ({len(errors)})"
                ):

                    st.write(
                        errors
                    )


            # ---------------------------------------------------------------
            # FULL REPORT
            # ---------------------------------------------------------------

            with st.expander(
                "Full run report"
            ):

                st.json(
                    report
                )


        except Exception as exc:

            st.error(
                "The sourcing run failed."
            )

            st.exception(
                exc
            )


# ============================================================================
# RUN HISTORY
# ============================================================================

elif page == "Run History":

    st.title(
        "Run History"
    )

    st.caption(
        "Previous sourcing runs performed by the team."
    )

    runs = database.list_runs(
        100
    )


    if not runs:

        st.info(
            "No sourcing runs have been recorded yet."
        )


    else:

        import pandas as pd

        df = pd.DataFrame(
            runs
        )

        display_cols = [
            "id",
            "started_at",
            "finished_at",
            "user_email",
            "target",
            "accepted_count",
            "duplicate_count",
            "rejected_count",
            "partner_error_count",
            "status",
        ]

        available_cols = [
            col
            for col in display_cols
            if col in df.columns
        ]

        st.dataframe(
            df[available_cols],
            use_container_width=True,
        )


        st.divider()

        st.markdown(
            "### Open run"
        )

        run_ids = [
            int(run["id"])
            for run in runs
        ]

        selected_run_id = st.selectbox(
            "Select a run",
            run_ids,
        )

        selected = database.get_run(
            int(selected_run_id)
        )


        if selected:

            st.write(
                f"**Run #{selected['id']}**"
            )

            st.write(
                f"Started: {selected['started_at']}"
            )

            st.write(
                f"Finished: {selected['finished_at']}"
            )

            st.write(
                f"User: {selected['user_email']}"
            )

            try:

                report = json.loads(
                    selected["report_json"]
                )

                st.json(
                    report
                )

            except Exception:

                st.code(
                    selected["report_json"]
                )


# ============================================================================
# ADMIN
# ============================================================================

elif page == "Admin":

    if user["role"] != "admin":

        st.error(
            "Admin access required."
        )

        st.stop()


    st.title(
        "Team Administration"
    )

    st.caption(
        "Create and manage team accounts."
    )


    # ------------------------------------------------------------------------
    # CREATE USER
    # ------------------------------------------------------------------------

    st.markdown(
        "### Create team member"
    )

    with st.form(
        "new_user_form"
    ):

        new_email = st.text_input(
            "Team member email"
        )

        new_password = st.text_input(
            "Temporary password",
            type="password",
        )

        new_role = st.selectbox(
            "Role",
            [
                "user",
                "admin",
            ],
        )

        submitted = st.form_submit_button(
            "Create user",
            type="primary",
        )


        if submitted:

            if not new_email.strip():

                st.error(
                    "Email is required."
                )

            elif not new_password:

                st.error(
                    "Password is required."
                )

            else:

                try:

                    database.create_user(
                        new_email,
                        new_password,
                        new_role,
                    )

                    st.success(
                        f"Created {new_email.strip().lower()}."
                    )

                except Exception as exc:

                    st.error(
                        f"Could not create user: {exc}"
                    )


    # ------------------------------------------------------------------------
    # EXISTING USERS
    # ------------------------------------------------------------------------

    st.markdown(
        "### Existing users"
    )

    users = database.list_users()


    if users:

        st.dataframe(
            users,
            use_container_width=True,
        )

    else:

        st.info(
            "No users found."
        )


    # ------------------------------------------------------------------------
    # PASSWORD RESET
    # ------------------------------------------------------------------------

    st.markdown(
        "### Reset a team member password"
    )

    with st.form(
        "reset_password_form"
    ):

        reset_email = st.text_input(
            "Account email"
        )

        reset_new_password = st.text_input(
            "New password",
            type="password",
        )

        reset_submitted = st.form_submit_button(
            "Reset password"
        )


        if reset_submitted:

            if not reset_email.strip():

                st.error(
                    "Email is required."
                )

            elif not reset_new_password:

                st.error(
                    "New password is required."
                )

            else:

                changed = database.reset_password(
                    reset_email,
                    reset_new_password,
                )


                if changed:

                    st.success(
                        "Password reset successfully."
                    )

                else:

                    st.error(
                        "No account exists with that email."
                    )
