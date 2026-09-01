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
# DARK UI / BRAND STYLING
# ============================================================================

st.markdown(
    """
    <style>

    /* ================================================================
       GLOBAL
       ================================================================ */

    .stApp {
        background: #080808;
        color: #F5F7FA;
    }

    [data-testid="stAppViewContainer"] {
        background: #080808;
    }

    [data-testid="stHeader"] {
        background: transparent;
    }

    #MainMenu {
        visibility: hidden;
    }

    footer {
        visibility: hidden;
    }


    /* ================================================================
       SIDEBAR
       ================================================================ */

    section[data-testid="stSidebar"] {
        background: #050505;
        border-right: 1px solid #242424;
    }

    section[data-testid="stSidebar"] > div {
        background: #050505;
    }

    section[data-testid="stSidebar"] * {
        color: #F5F7FA;
    }


    /* ================================================================
       GENERAL TEXT
       ================================================================ */

    p,
    span,
    label {
        color: inherit;
    }

    .stMarkdown {
        color: #F5F7FA;
    }

    .stCaption {
        color: #A7ADB7 !important;
    }


    /* ================================================================
       HEADINGS
       ================================================================ */

    h1,
    h2,
    h3,
    h4 {
        color: #F5F7FA !important;
        letter-spacing: -0.02em;
    }

    h1 {
        font-weight: 750;
    }

    h2,
    h3 {
        font-weight: 700;
    }


    /* ================================================================
       HERO
       ================================================================ */

    .nv-hero {
        background: #050505;
        border: 1px solid #252525;
        border-radius: 16px;
        padding: 30px 32px;
        margin-bottom: 24px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    }

    .nv-hero-title {
        color: #FFFFFF !important;
        font-size: 38px;
        font-weight: 750;
        margin: 0;
    }

    .nv-hero-subtitle {
        color: #A7ADB7 !important;
        font-size: 16px;
        margin-top: 8px;
    }


    /* ================================================================
       GEOGRAPHIC FOCUS
       ================================================================ */

    .nv-focus {
        background: #101923;
        border: 1px solid #164B83;
        border-radius: 12px;
        padding: 18px;
        margin: 10px 0 24px 0;
    }

    .nv-focus-title {
        font-size: 14px;
        font-weight: 700;
        color: #65A9FF !important;
    }

    .nv-focus-main {
        font-size: 18px;
        font-weight: 700;
        color: #FFFFFF !important;
        margin-top: 6px;
    }

    .nv-focus-text {
        font-size: 13px;
        color: #B8C0CC !important;
        margin-top: 7px;
    }


    /* ================================================================
       METRICS
       ================================================================ */

    div[data-testid="stMetric"] {
        background: #111111;
        border: 1px solid #292929;
        border-radius: 12px;
        padding: 18px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.18);
    }

    div[data-testid="stMetric"] label {
        color: #9CA3AF !important;
    }

    div[data-testid="stMetric"] [data-testid="stMetricValue"] {
        color: #FFFFFF !important;
    }


    /* ================================================================
       INPUTS
       ================================================================ */

    div[data-baseweb="input"] {
        background: #151515;
        border-radius: 8px;
    }

    div[data-baseweb="input"] input {
        color: #FFFFFF !important;
    }

    div[data-baseweb="textarea"] {
        background: #151515;
    }

    div[data-baseweb="textarea"] textarea {
        color: #FFFFFF !important;
    }


    /* ================================================================
       SELECTBOX
       ================================================================ */

    div[data-baseweb="select"] > div {
        background: #151515;
        border-color: #333333;
        color: #FFFFFF;
    }


    /* ================================================================
       NUMBER INPUT
       ================================================================ */

    div[data-testid="stNumberInput"] > div {
        background: #151515;
        border-radius: 8px;
    }

    div[data-testid="stNumberInput"] input {
        color: #FFFFFF !important;
    }


    /* ================================================================
       BUTTONS
       ================================================================ */

    .stButton > button {
        background: #151515;
        color: #FFFFFF;
        border: 1px solid #383838;
        border-radius: 8px;
        font-weight: 600;
        min-height: 42px;
    }

    .stButton > button:hover {
        border-color: #0B74FF;
        color: #FFFFFF;
    }

    .stButton > button[kind="primary"] {
        background: #0B74FF;
        border: 1px solid #0B74FF;
        color: #FFFFFF;
        font-weight: 700;
        border-radius: 8px;
        min-height: 48px;
    }

    .stButton > button[kind="primary"]:hover {
        background: #0866DD;
        border-color: #0866DD;
    }


    /* ================================================================
       ALERTS
       ================================================================ */

    div[data-testid="stAlert"] {
        background: #151515;
        border: 1px solid #303030;
        color: #F5F7FA;
    }

    div[data-testid="stAlert"] p {
        color: #F5F7FA !important;
    }


    /* ================================================================
       EXPANDERS
       ================================================================ */

    div[data-testid="stExpander"] {
        background: #111111;
        border: 1px solid #292929;
        border-radius: 10px;
    }

    div[data-testid="stExpander"] summary {
        color: #FFFFFF !important;
    }


    /* ================================================================
       DATAFRAMES
       ================================================================ */

    div[data-testid="stDataFrame"] {
        background: #111111;
        border: 1px solid #292929;
        border-radius: 10px;
    }


    /* ================================================================
       DIVIDERS
       ================================================================ */

    hr {
        border-color: #292929 !important;
    }


    /* ================================================================
       SIDEBAR CREDIT
       ================================================================ */

    .nv-credit {
        margin-top: 26px;
        padding: 14px;
        border: 1px solid #303030;
        border-radius: 10px;
        background: #0B0B0B;
        text-align: center;
    }

    .nv-credit-small {
        font-size: 12px;
        color: #999999 !important;
        margin-bottom: 5px;
    }

    .nv-credit-name {
        font-size: 14px;
        font-weight: 700;
        color: #FFFFFF !important;
    }

    .nv-credit-product {
        font-size: 11px;
        color: #777777 !important;
        margin-top: 5px;
    }


    /* ================================================================
       LOGIN
       ================================================================ */

    .nv-login-wrap {
        max-width: 620px;
        margin: 55px auto 0 auto;
        padding: 10px;
    }

    .nv-login-title {
        text-align: center;
        font-size: 32px;
        font-weight: 750;
        color: #FFFFFF !important;
        margin-top: 20px;
    }

    .nv-login-subtitle {
        text-align: center;
        color: #A7ADB7 !important;
        margin-bottom: 25px;
    }


    /* ================================================================
       RADIO / CHECKBOX
       ================================================================ */

    [data-testid="stCheckbox"] label,
    [data-testid="stRadio"] label {
        color: #F5F7FA !important;
    }


    /* ================================================================
       LINKS
       ================================================================ */

    a {
        color: #65A9FF !important;
    }

    </style>
    """,
    unsafe_allow_html=True,
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

    st.markdown(
        '<div class="nv-login-wrap">',
        unsafe_allow_html=True,
    )

    if LOGO_PATH.is_file():
        st.image(
            str(LOGO_PATH),
            use_container_width=True,
        )
    else:
        st.markdown(
            '<div style="text-align:center;"><h1>nVentures</h1></div>',
            unsafe_allow_html=True,
        )

    st.markdown(
        '<div class="nv-login-title">Sourcing Intelligence</div>',
        unsafe_allow_html=True,
    )

    st.markdown(
        '<div class="nv-login-subtitle">'
        'Private sourcing platform for the nVentures team.'
        '</div>',
        unsafe_allow_html=True,
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

    st.markdown(
        """
        <div style="
            text-align:center;
            color:#888;
            font-size:12px;
            margin-top:25px;
        ">
            nVentures Sourcing Platform
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        "</div>",
        unsafe_allow_html=True,
    )

    st.stop()


# ============================================================================
# CURRENT USER
# ============================================================================

user = st.session_state.user


# ============================================================================
# SIDEBAR BRANDING
# ============================================================================

# Use the sidebar image directly so the full nVentures logo is visible.
# Do not use st.logo() here: Streamlit renders that API as a small navigation
# logo rather than the larger branded sidebar treatment we want.
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

st.sidebar.markdown(
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
    """,
    unsafe_allow_html=True,
)


# ============================================================================
# DASHBOARD
# ============================================================================

if page == "Dashboard":

    st.markdown(
        """
        <div class="nv-hero">

            <div class="nv-hero-title">
                Sourcing Intelligence
            </div>

            <div class="nv-hero-subtitle">
                AI-powered company discovery, research and investment sourcing.
            </div>

        </div>
        """,
        unsafe_allow_html=True,
    )


    # ------------------------------------------------------------------------
    # GEOGRAPHIC FOCUS
    # ------------------------------------------------------------------------

    st.markdown(
        """
        <div class="nv-focus">

            <div class="nv-focus-title">
                🌐 Geographic Focus — Hard Filter
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
        """,
        unsafe_allow_html=True,
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
        f"**B2B:** required  •  "
        f"**Stage:** pre-seed/seed  •  "
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
        "🚀 Start sourcing",
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
