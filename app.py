import os
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import streamlit as st
from dotenv import load_dotenv

import database
from config import settings, ELIGIBLE_COUNTRIES
from google_sheets import get_worksheets
from sourcing_engine import run_sourcing


# ============================================================================
# PATHS
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
# CUSTOM CSS
# ============================================================================

st.markdown(
    """
<style>

/* =========================================================================
   GLOBAL
   ========================================================================= */

.stApp {
    background: #070707;
    color: #F5F7FA;
}

[data-testid="stAppViewContainer"] {
    background: #070707;
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


/* =========================================================================
   MAIN CONTENT WIDTH
   ========================================================================= */

.block-container {
    padding-top: 2.5rem;
    padding-bottom: 4rem;
    max-width: 1500px;
}


/* =========================================================================
   SIDEBAR
   ========================================================================= */

section[data-testid="stSidebar"] {
    background: #050505;
    border-right: 1px solid #202020;
}

section[data-testid="stSidebar"] > div {
    background: #050505;
}

section[data-testid="stSidebar"] * {
    color: #F5F7FA;
}


/* =========================================================================
   SIDEBAR LOGO
   ========================================================================= */

.nv-sidebar-logo {
    width: 205px;
    max-width: 100%;
    height: auto;
    display: block;
    margin: 8px auto 26px auto;
}


/* =========================================================================
   SIDEBAR USER CARD
   ========================================================================= */

.nv-user-card {
    background: #0C0C0C;
    border: 1px solid #242424;
    border-radius: 12px;
    padding: 14px;
    margin: 10px 0 18px 0;
}

.nv-user-label {
    color: #777D86 !important;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 5px;
}

.nv-user-email {
    color: #FFFFFF !important;
    font-size: 13px;
    font-weight: 600;
    word-break: break-word;
}

.nv-user-role {
    color: #65A9FF !important;
    font-size: 12px;
    margin-top: 5px;
}


/* =========================================================================
   SIDEBAR NAVIGATION
   ========================================================================= */

section[data-testid="stSidebar"] [data-testid="stRadio"] label {
    color: #D9DDE4 !important;
}

section[data-testid="stSidebar"] [data-testid="stRadio"] label:hover {
    color: #FFFFFF !important;
}


/* =========================================================================
   SIDEBAR CREDIT
   ========================================================================= */

.nv-credit {
    margin-top: 26px;
    padding: 14px;
    border: 1px solid #252525;
    border-radius: 12px;
    background: #090909;
    text-align: center;
}

.nv-credit-small {
    color: #727780 !important;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 5px;
}

.nv-credit-name {
    color: #FFFFFF !important;
    font-size: 13px;
    font-weight: 700;
}

.nv-credit-product {
    color: #686D76 !important;
    font-size: 10px;
    margin-top: 4px;
}


/* =========================================================================
   TYPOGRAPHY
   ========================================================================= */

h1,
h2,
h3,
h4 {
    color: #FFFFFF !important;
    letter-spacing: -0.025em;
}

h1 {
    font-weight: 800;
}

h2,
h3 {
    font-weight: 750;
}

p,
span,
label {
    color: inherit;
}


/* =========================================================================
   HERO
   ========================================================================= */

.nv-hero {
    position: relative;
    overflow: hidden;
    background:
        radial-gradient(
            circle at 90% 10%,
            rgba(11, 116, 255, 0.16),
            transparent 32%
        ),
        #0A0A0A;
    border: 1px solid #242424;
    border-radius: 18px;
    padding: 34px 36px;
    margin-bottom: 22px;
}

.nv-hero:before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: #0B74FF;
}

.nv-hero-eyebrow {
    color: #65A9FF !important;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 8px;
}

.nv-hero-title {
    color: #FFFFFF !important;
    font-size: 42px;
    line-height: 1.05;
    font-weight: 800;
    margin: 0;
}

.nv-hero-subtitle {
    color: #9DA4AE !important;
    font-size: 15px;
    margin-top: 10px;
    max-width: 760px;
}


/* =========================================================================
   FOCUS CARD
   ========================================================================= */

.nv-focus {
    background:
        linear-gradient(
            135deg,
            #0D1824,
            #0B1118
        );
    border: 1px solid #164B83;
    border-radius: 14px;
    padding: 20px 22px;
    margin-bottom: 26px;
}

.nv-focus-title {
    color: #65A9FF !important;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.nv-focus-main {
    color: #FFFFFF !important;
    font-size: 21px;
    font-weight: 750;
    margin-top: 7px;
}

.nv-focus-text {
    color: #AEB7C3 !important;
    font-size: 12px;
    line-height: 1.6;
    margin-top: 7px;
}


/* =========================================================================
   SECTION LABEL
   ========================================================================= */

.nv-section-label {
    color: #7F8792 !important;
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
}


/* =========================================================================
   CONTROL CARDS
   ========================================================================= */

.nv-control-card {
    background: #0C0C0C;
    border: 1px solid #242424;
    border-radius: 14px;
    padding: 18px;
}


/* =========================================================================
   METRICS
   ========================================================================= */

div[data-testid="stMetric"] {
    background: #0C0C0C;
    border: 1px solid #242424;
    border-radius: 14px;
    padding: 18px;
}

div[data-testid="stMetric"] label {
    color: #858C96 !important;
}

div[data-testid="stMetric"] [data-testid="stMetricValue"] {
    color: #FFFFFF !important;
    font-weight: 800;
}


/* =========================================================================
   INPUTS
   ========================================================================= */

div[data-baseweb="input"] {
    background: #111111;
    border-radius: 9px;
}

div[data-baseweb="input"] input {
    color: #FFFFFF !important;
}

div[data-baseweb="textarea"] {
    background: #111111;
}

div[data-baseweb="textarea"] textarea {
    color: #FFFFFF !important;
}

div[data-baseweb="select"] > div {
    background: #111111;
    border-color: #303030;
    color: #FFFFFF;
}

div[data-testid="stNumberInput"] > div {
    background: #111111;
    border-radius: 9px;
}

div[data-testid="stNumberInput"] input {
    color: #FFFFFF !important;
}


/* =========================================================================
   BUTTONS
   ========================================================================= */

.stButton > button {
    background: #111111;
    color: #FFFFFF;
    border: 1px solid #343434;
    border-radius: 9px;
    min-height: 42px;
    font-weight: 650;
}

.stButton > button:hover {
    border-color: #0B74FF;
    color: #FFFFFF;
}

.stButton > button[kind="primary"] {
    background: #0B74FF;
    border: 1px solid #0B74FF;
    color: #FFFFFF;
    border-radius: 9px;
    min-height: 48px;
    font-weight: 750;
}

.stButton > button[kind="primary"]:hover {
    background: #0866DD;
    border-color: #0866DD;
}


/* =========================================================================
   ALERTS
   ========================================================================= */

div[data-testid="stAlert"] {
    border-radius: 10px;
}

div[data-testid="stAlert"] p {
    color: #F5F7FA !important;
}


/* =========================================================================
   EXPANDERS
   ========================================================================= */

div[data-testid="stExpander"] {
    background: #0C0C0C;
    border: 1px solid #242424;
    border-radius: 12px;
}

div[data-testid="stExpander"] summary {
    color: #FFFFFF !important;
}


/* =========================================================================
   DATAFRAME
   ========================================================================= */

div[data-testid="stDataFrame"] {
    background: #0B0B0B;
    border: 1px solid #242424;
    border-radius: 12px;
}


/* =========================================================================
   DIVIDERS
   ========================================================================= */

hr {
    border-color: #242424 !important;
}


/* =========================================================================
   STATUS CARDS
   ========================================================================= */

.nv-status {
    background: #0C0C0C;
    border: 1px solid #242424;
    border-radius: 12px;
    padding: 15px;
}

.nv-status-title {
    color: #858C96 !important;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.nv-status-value {
    color: #FFFFFF !important;
    font-size: 14px;
    font-weight: 700;
    margin-top: 5px;
}


/* =========================================================================
   RUN RESULT HEADER
   ========================================================================= */

.nv-result {
    background:
        radial-gradient(
            circle at 95% 0%,
            rgba(11, 116, 255, 0.10),
            transparent 30%
        ),
        #0A0A0A;
    border: 1px solid #242424;
    border-radius: 14px;
    padding: 20px;
    margin: 18px 0;
}

.nv-result-title {
    color: #FFFFFF !important;
    font-size: 20px;
    font-weight: 800;
}

.nv-result-subtitle {
    color: #7F8792 !important;
    font-size: 12px;
    margin-top: 4px;
}


/* =========================================================================
   LOGIN
   ========================================================================= */

.nv-login {
    max-width: 520px;
    margin: 80px auto 0 auto;
    padding: 32px;
    background: #0A0A0A;
    border: 1px solid #242424;
    border-radius: 18px;
}

.nv-login-logo {
    width: 230px;
    max-width: 80%;
    display: block;
    margin: 0 auto 30px auto;
}

.nv-login-title {
    color: #FFFFFF !important;
    text-align: center;
    font-size: 31px;
    font-weight: 800;
}

.nv-login-subtitle {
    color: #8F969F !important;
    text-align: center;
    font-size: 13px;
    margin: 8px 0 25px 0;
}


/* =========================================================================
   LINKS
   ========================================================================= */

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

if "last_report" not in st.session_state:
    st.session_state.last_report = None

if "last_run_id" not in st.session_state:
    st.session_state.last_run_id = None


# ============================================================================
# LOGIN
# ============================================================================

if not st.session_state.user:

    st.markdown(
        '<div class="nv-login">',
        unsafe_allow_html=True,
    )

    if LOGO_PATH.is_file():

        st.markdown(
            f'<img class="nv-login-logo" src="{LOGO_PATH.as_posix()}">',
            unsafe_allow_html=True,
        )

    else:

        st.markdown(
            '<div class="nv-login-title">nVentures</div>',
            unsafe_allow_html=True,
        )

    st.markdown(
        '<div class="nv-login-title">Sourcing Intelligence</div>',
        unsafe_allow_html=True,
    )

    st.markdown(
        '<div class="nv-login-subtitle">'
        'Private AI-powered sourcing platform'
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
        '<div style="'
        'text-align:center;'
        'color:#60656d;'
        'font-size:11px;'
        'margin-top:22px;'
        '">'
        'nVentures Sourcing Platform'
        '</div>',
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

if LOGO_PATH.is_file():

    st.sidebar.markdown(
        f'<img class="nv-sidebar-logo" src="{LOGO_PATH.as_posix()}">',
        unsafe_allow_html=True,
    )

else:

    st.sidebar.markdown(
        "## nVentures"
    )


# ============================================================================
# SIDEBAR USER
# ============================================================================

st.sidebar.markdown(
    f"""
    <div class="nv-user-card">
        <div class="nv-user-label">Signed in as</div>
        <div class="nv-user-email">{user["email"]}</div>
        <div class="nv-user-role">Role: {user["role"]}</div>
    </div>
    """,
    unsafe_allow_html=True,
)


# ============================================================================
# SIGN OUT
# ============================================================================

if st.sidebar.button(
    "Sign out",
    use_container_width=True,
):

    st.session_state.user = None
    st.session_state.last_report = None
    st.session_state.last_run_id = None

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
# SINGLE CREDIT LOCATION
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

    # ------------------------------------------------------------------------
    # HERO
    # ------------------------------------------------------------------------

    st.markdown(
        """
        <div class="nv-hero">

            <div class="nv-hero-eyebrow">
                nVentures • Fund II
            </div>

            <div class="nv-hero-title">
                Sourcing Intelligence
            </div>

            <div class="nv-hero-subtitle">
                AI-powered company discovery, research and investment sourcing.
                Discover qualified companies from the nVentures partner network
                and push verified opportunities directly into Active Sourcing.
            </div>

        </div>
        """,
        unsafe_allow_html=True,
    )


    # ------------------------------------------------------------------------
    # GEOGRAPHIC FOCUS
    # ------------------------------------------------------------------------

    st.markdown(
        f"""
        <div class="nv-focus">

            <div class="nv-focus-title">
                🌐 Geographic Focus • Hard Filter
            </div>

            <div class="nv-focus-main">
                South Asia + Singapore
            </div>

            <div class="nv-focus-text">
                {", ".join(ELIGIBLE_COUNTRIES)}
            </div>

            <div class="nv-focus-text">
                Companies must be headquartered in an eligible country.
                Geography is enforced in Python and cannot be overridden by
                the AI model.
            </div>

        </div>
        """,
        unsafe_allow_html=True,
    )


    # ------------------------------------------------------------------------
    # QUICK STATUS
    # ------------------------------------------------------------------------

    st.markdown(
        '<div class="nv-section-label">System overview</div>',
        unsafe_allow_html=True,
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

    s1, s2, s3 = st.columns(3)

    with s1:

        st.markdown(
            f"""
            <div class="nv-status">
                <div class="nv-status-title">
                    Research AI
                </div>
                <div class="nv-status-value">
                    {"● Online" if openrouter_ready else "● Missing key"}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with s2:

        st.markdown(
            f"""
            <div class="nv-status">
                <div class="nv-status-title">
                    Web Research
                </div>
                <div class="nv-status-value">
                    {"● Online" if tavily_ready else "● Missing key"}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with s3:

        st.markdown(
            f"""
            <div class="nv-status">
                <div class="nv-status-title">
                    Google Sheets
                </div>
                <div class="nv-status-value">
                    {"● Connected" if google_ready else "● Missing credentials"}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )


    st.markdown("<br>", unsafe_allow_html=True)


    # ------------------------------------------------------------------------
    # SOURCING CONTROLS
    # ------------------------------------------------------------------------

    st.markdown(
        '<div class="nv-section-label">Run configuration</div>',
        unsafe_allow_html=True,
    )

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
            help="Maximum number of new companies to accept.",
        )

    with c2:

        max_partners = st.number_input(
            "Partners per run",
            min_value=1,
            max_value=50,
            value=int(settings.max_partners),
            step=1,
            help="Maximum partner sources to process.",
        )

    with c3:

        max_research = st.number_input(
            "Deep research limit",
            min_value=1,
            max_value=200,
            value=int(settings.max_deep_research),
            step=1,
            help="Maximum deep company research calls.",
        )


    # ------------------------------------------------------------------------
    # CRITERIA
    # ------------------------------------------------------------------------

    st.markdown(
        "### Investment criteria"
    )

    criteria_1, criteria_2, criteria_3 = st.columns(3)

    with criteria_1:

        st.markdown(
            """
            **Business model**

            B2B required
            """
        )

    with criteria_2:

        st.markdown(
            """
            **Stage**

            Pre-seed / Seed
            """
        )

    with criteria_3:

        st.markdown(
            f"""
            **Funding ceiling**

            ${settings.max_total_funding:,.0f}
            """
        )


    st.divider()


    # ------------------------------------------------------------------------
    # GEOGRAPHIC ELIGIBILITY
    # ------------------------------------------------------------------------

    st.markdown(
        "### Geographic eligibility"
    )

    st.info(
        "Eligible headquarters: "
        + ", ".join(ELIGIBLE_COUNTRIES)
    )

    st.caption(
        "Hard Python-level filter. An AI response cannot override this rule."
    )


    st.divider()


    # ------------------------------------------------------------------------
    # START RUN
    # ------------------------------------------------------------------------

    st.markdown(
        "### Launch sourcing run"
    )

    st.caption(
        "The engine will research candidates, verify eligibility, "
        "deduplicate against Active Sourcing, and write accepted companies."
    )

    start_run = st.button(
        "🚀 Start sourcing",
        type="primary",
        use_container_width=True,
    )


    if start_run:

        if not openrouter_ready:

            st.error(
                "OpenRouter API key is missing."
            )

            st.stop()

        if not tavily_ready:

            st.error(
                "Tavily API key is missing."
            )

            st.stop()

        if not google_ready:

            st.error(
                "Google service account credentials are missing."
            )

            st.stop()


        started = datetime.now(
            timezone.utc
        ).isoformat()


        st.session_state.last_report = None
        st.session_state.last_run_id = None


        st.markdown(
            """
            <div class="nv-result">
                <div class="nv-result-title">
                    Sourcing run in progress
                </div>
                <div class="nv-result-subtitle">
                    Researching partner sources and validating candidates.
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )


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
            # RUN ENGINE
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


            st.session_state.last_report = report
            st.session_state.last_run_id = run_id


            progress.progress(100)

            status.success(
                f"Run #{run_id} completed successfully."
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
            # RESULT SUMMARY
            # ---------------------------------------------------------------

            st.markdown(
                f"""
                <div class="nv-result">

                    <div class="nv-result-title">
                        Run #{run_id} complete
                    </div>

                    <div class="nv-result-subtitle">
                        Target: {int(target)} companies
                    </div>

                </div>
                """,
                unsafe_allow_html=True,
            )


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
                "Errors",
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
                    [],
                )

                if accepted_details:

                    display_data = []

                    for item in accepted_details:

                        display_data.append(
                            {
                                "Company": item.get(
                                    "company",
                                    "",
                                ),

                                "Country": item.get(
                                    "country",
                                    "",
                                ),

                                "Headquarters": item.get(
                                    "headquarters",
                                    "",
                                ),

                                "Sector": item.get(
                                    "sector",
                                    "",
                                ),

                                "Stage": item.get(
                                    "stage",
                                    "",
                                ),

                                "Partner": item.get(
                                    "partner",
                                    "",
                                ),

                                "Sheet row": item.get(
                                    "row",
                                    "",
                                ),

                                "Fields": item.get(
                                    "fields",
                                    "",
                                ),
                            }
                        )

                    st.dataframe(
                        pd.DataFrame(display_data),
                        use_container_width=True,
                        hide_index=True,
                    )

                else:

                    st.write(
                        accepted
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
                    f"Rejected candidates • {len(rejected)}"
                ):

                    st.write(
                        rejected
                    )


            # ---------------------------------------------------------------
            # DUPLICATES
            # ---------------------------------------------------------------

            if duplicates:

                with st.expander(
                    f"Duplicates skipped • {len(duplicates)}"
                ):

                    st.write(
                        duplicates
                    )


            # ---------------------------------------------------------------
            # ERRORS
            # ---------------------------------------------------------------

            if errors:

                with st.expander(
                    f"Partner/API errors • {len(errors)}"
                ):

                    st.write(
                        errors
                    )


            # ---------------------------------------------------------------
            # FULL REPORT
            # ---------------------------------------------------------------

            with st.expander(
                "View full run report"
            ):

                st.json(
                    report
                )


        except Exception as exc:

            status.error(
                "The sourcing run failed."
            )

            st.error(
                "The sourcing run could not be completed."
            )

            st.exception(
                exc
            )


# ============================================================================
# RUN HISTORY
# ============================================================================

elif page == "Run History":

    st.markdown(
        """
        <div class="nv-hero">
            <div class="nv-hero-eyebrow">
                Operations
            </div>
            <div class="nv-hero-title">
                Run History
            </div>
            <div class="nv-hero-subtitle">
                Review previous sourcing runs, results and system activity.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


    runs = database.list_runs(
        100
    )


    if not runs:

        st.info(
            "No sourcing runs have been recorded yet."
        )

    else:

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
            hide_index=True,
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

            st.markdown(
                f"""
                <div class="nv-result">

                    <div class="nv-result-title">
                        Run #{selected["id"]}
                    </div>

                    <div class="nv-result-subtitle">
                        {selected["user_email"]}
                    </div>

                </div>
                """,
                unsafe_allow_html=True,
            )


            r1, r2, r3 = st.columns(3)

            with r1:

                st.caption("Started")

                st.write(
                    selected["started_at"]
                )

            with r2:

                st.caption("Finished")

                st.write(
                    selected["finished_at"]
                )

            with r3:

                st.caption("Target")

                st.write(
                    selected["target"]
                )


            try:

                report = json.loads(
                    selected["report_json"]
                )

                accepted = report.get(
                    "accepted",
                    [],
                )

                duplicates = report.get(
                    "duplicates",
                    [],
                )

                rejected = report.get(
                    "rejected",
                    [],
                )

                errors = report.get(
                    "partner_errors",
                    [],
                )


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
                    "Errors",
                    len(errors),
                )


                with st.expander(
                    "Full run report",
                    expanded=True,
                ):

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


    st.markdown(
        """
        <div class="nv-hero">
            <div class="nv-hero-eyebrow">
                Administration
            </div>
            <div class="nv-hero-title">
                Team Administration
            </div>
            <div class="nv-hero-subtitle">
                Manage nVentures sourcing platform accounts and access.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
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


    st.divider()


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
            hide_index=True,
        )

    else:

        st.info(
            "No users found."
        )


    st.divider()


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
