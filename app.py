import os
import json
import base64
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent

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

load_dotenv(dotenv_path=ENV_PATH, override=True)


# ============================================================================
# PAGE CONFIG
# ============================================================================

st.set_page_config(
    page_title="nVentures • Sourcing Intelligence",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ============================================================================
# HELPERS
# ============================================================================

def logo_data_uri():
    """Return the local logo as a data URI so it renders reliably in HTML."""
    if not LOGO_PATH.is_file():
        return None

    try:
        encoded = base64.b64encode(LOGO_PATH.read_bytes()).decode("utf-8")
        suffix = LOGO_PATH.suffix.lower()
        mime = "image/png" if suffix == ".png" else "image/jpeg"
        return f"data:{mime};base64,{encoded}"
    except Exception:
        return None


def html(content):
    """Render multiline HTML without Markdown's indentation/code-block issue."""
    st.markdown(dedent(content), unsafe_allow_html=True)


def status_dot(ready, online_label="Online", missing_label="Not configured"):
    return f"● {online_label if ready else missing_label}"


def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def report_list(report, key):
    value = report.get(key, [])
    return value if isinstance(value, list) else []


LOGO_URI = logo_data_uri()


# ============================================================================
# CUSTOM CSS
# ============================================================================

st.markdown(
    dedent(
        """
        <style>

        /* ====================================================================
           GLOBAL APP
           ==================================================================== */

        :root {
            --nv-bg: #07090c;
            --nv-panel: #0d1015;
            --nv-panel-2: #11151c;
            --nv-panel-3: #151a22;
            --nv-border: rgba(255,255,255,.08);
            --nv-border-strong: rgba(255,255,255,.13);
            --nv-text: #f5f7fb;
            --nv-muted: #8b95a5;
            --nv-dim: #626c7b;
            --nv-blue: #4d9cff;
            --nv-blue-2: #2678e8;
            --nv-green: #32d583;
            --nv-yellow: #f6c84c;
            --nv-red: #ff647c;
        }

        .stApp {
            background:
                radial-gradient(circle at 70% -10%, rgba(38,120,232,.10), transparent 30%),
                radial-gradient(circle at 0% 35%, rgba(77,156,255,.035), transparent 28%),
                var(--nv-bg);
            color: var(--nv-text);
        }

        [data-testid="stAppViewContainer"] {
            background: transparent;
        }

        [data-testid="stHeader"] {
            background: transparent;
        }

        #MainMenu,
        footer {
            visibility: hidden;
        }

        .block-container {
            max-width: 1480px;
            padding-top: 2.1rem;
            padding-bottom: 4.5rem;
        }

        /* ====================================================================
           SIDEBAR
           ==================================================================== */

        section[data-testid="stSidebar"] {
            background: #06080b;
            border-right: 1px solid rgba(255,255,255,.075);
        }

        section[data-testid="stSidebar"] > div {
            background: transparent;
            padding: 1.2rem .95rem 1rem .95rem;
        }

        section[data-testid="stSidebar"] * {
            color: var(--nv-text);
        }

        .nv-brand {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 58px;
            margin: 0 0 22px 0;
        }

        .nv-brand img {
            width: 228px;
            max-width: 96%;
            height: auto;
            display: block;
        }

        .nv-brand-fallback {
            font-size: 21px;
            font-weight: 800;
            letter-spacing: -.04em;
            color: #fff !important;
        }

        .nv-sidebar-rule {
            height: 1px;
            background: rgba(255,255,255,.09);
            margin: 0 0 20px 0;
        }

        .nv-profile {
            background: linear-gradient(145deg, #0d1117, #090b0f);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 14px;
            padding: 14px;
            margin-bottom: 20px;
        }

        .nv-profile-label {
            color: #667180 !important;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .11em;
            font-weight: 800;
            margin-bottom: 6px;
        }

        .nv-profile-email {
            color: #fff !important;
            font-size: 12px;
            font-weight: 650;
            line-height: 1.4;
            word-break: break-word;
        }

        .nv-profile-role {
            display: inline-block;
            margin-top: 8px;
            padding: 4px 8px;
            border-radius: 999px;
            background: rgba(77,156,255,.10);
            border: 1px solid rgba(77,156,255,.20);
            color: #86bcff !important;
            font-size: 10px;
            font-weight: 750;
            text-transform: uppercase;
            letter-spacing: .06em;
        }

        section[data-testid="stSidebar"] [data-testid="stRadio"] > label {
            color: #7d8795 !important;
            font-size: 10px !important;
            text-transform: uppercase;
            letter-spacing: .11em;
            font-weight: 800;
            margin-bottom: 8px;
        }

        section[data-testid="stSidebar"] [data-testid="stRadio"] div[role="radiogroup"] {
            gap: 5px;
        }

        section[data-testid="stSidebar"] [data-testid="stRadio"] div[role="radiogroup"] > label {
            border-radius: 10px;
            padding: 8px 10px;
            transition: all .15s ease;
        }

        section[data-testid="stSidebar"] [data-testid="stRadio"] div[role="radiogroup"] > label:hover {
            background: rgba(255,255,255,.045);
        }

        section[data-testid="stSidebar"] [data-testid="stRadio"] div[role="radiogroup"] > label[data-checked="true"] {
            background: linear-gradient(90deg, rgba(77,156,255,.14), rgba(77,156,255,.035));
            border: 1px solid rgba(77,156,255,.16);
        }

        .nv-sidebar-spacer {
            height: 30px;
        }

        .nv-sidebar-credit {
            background: #090b0e;
            border: 1px solid rgba(255,255,255,.075);
            border-radius: 13px;
            padding: 13px;
            text-align: center;
            margin-top: 18px;
        }

        .nv-sidebar-credit .small {
            color: #626c79 !important;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: .12em;
            font-weight: 800;
        }

        .nv-sidebar-credit .name {
            color: #f5f7fb !important;
            font-size: 12px;
            font-weight: 750;
            margin-top: 4px;
        }

        .nv-sidebar-credit .product {
            color: #525c68 !important;
            font-size: 9px;
            margin-top: 3px;
        }

        /* ====================================================================
           BUTTONS
           ==================================================================== */

        .stButton > button {
            border-radius: 10px;
            min-height: 42px;
            border: 1px solid rgba(255,255,255,.11);
            background: #11151a;
            color: #f5f7fb;
            font-weight: 650;
            transition: all .16s ease;
        }

        .stButton > button:hover {
            border-color: rgba(77,156,255,.55);
            background: #151a21;
            color: #fff;
            transform: translateY(-1px);
        }

        .stButton > button[kind="primary"] {
            min-height: 50px;
            border: 1px solid #4d9cff;
            background: linear-gradient(135deg, #4d9cff, #2678e8);
            color: #fff;
            font-weight: 800;
            box-shadow: 0 10px 30px rgba(38,120,232,.16);
        }

        .stButton > button[kind="primary"]:hover {
            border-color: #72b2ff;
            background: linear-gradient(135deg, #65aaff, #3285ee);
            box-shadow: 0 14px 34px rgba(38,120,232,.23);
        }

        /* ====================================================================
           INPUTS
           ==================================================================== */

        div[data-baseweb="input"],
        div[data-baseweb="textarea"],
        div[data-baseweb="select"] > div,
        div[data-testid="stNumberInput"] > div {
            background: #11151b !important;
            border-color: rgba(255,255,255,.09) !important;
            border-radius: 10px !important;
        }

        div[data-baseweb="input"]:focus-within,
        div[data-baseweb="textarea"]:focus-within,
        div[data-baseweb="select"] > div:focus-within {
            border-color: rgba(77,156,255,.60) !important;
            box-shadow: 0 0 0 1px rgba(77,156,255,.15);
        }

        div[data-baseweb="input"] input,
        div[data-baseweb="textarea"] textarea,
        div[data-testid="stNumberInput"] input {
            color: #fff !important;
        }

        label,
        .stTextInput label,
        .stNumberInput label,
        .stSelectbox label {
            color: #a8b1bf !important;
            font-weight: 650;
            font-size: 12px;
        }

        /* ====================================================================
           TYPOGRAPHY
           ==================================================================== */

        h1, h2, h3, h4 {
            color: #fff !important;
            letter-spacing: -.035em;
        }

        h1 {
            font-weight: 850 !important;
        }

        h2, h3 {
            font-weight: 800 !important;
        }

        p {
            color: #b4bdc9;
        }

        hr {
            border-color: rgba(255,255,255,.08) !important;
        }

        /* ====================================================================
           EXECUTIVE HEADER
           ==================================================================== */

        .nv-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            margin-bottom: 16px;
        }

        .nv-breadcrumb {
            color: #687382 !important;
            font-size: 11px;
            font-weight: 750;
            text-transform: uppercase;
            letter-spacing: .10em;
        }

        .nv-live {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            color: #8792a1 !important;
            font-size: 11px;
            font-weight: 650;
        }

        .nv-live-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #32d583;
            box-shadow: 0 0 12px rgba(50,213,131,.7);
        }

        /* ====================================================================
           HERO
           ==================================================================== */

        .nv-hero {
            position: relative;
            overflow: hidden;
            min-height: 205px;
            border: 1px solid rgba(255,255,255,.085);
            border-radius: 20px;
            background:
                radial-gradient(circle at 88% 15%, rgba(77,156,255,.18), transparent 29%),
                radial-gradient(circle at 100% 100%, rgba(38,120,232,.08), transparent 32%),
                linear-gradient(145deg, #0d1117, #090b0f 72%);
            padding: 34px 38px;
            margin-bottom: 18px;
            box-shadow: 0 22px 60px rgba(0,0,0,.18);
        }

        .nv-hero:before {
            content: "";
            position: absolute;
            left: 0;
            top: 28px;
            bottom: 28px;
            width: 3px;
            border-radius: 0 3px 3px 0;
            background: linear-gradient(#65aaff, #2678e8);
        }

        .nv-hero-eyebrow {
            color: #75b4ff !important;
            font-size: 10px;
            font-weight: 850;
            text-transform: uppercase;
            letter-spacing: .14em;
            margin-bottom: 9px;
        }

        .nv-hero-title {
            color: #fff !important;
            font-size: clamp(34px, 4vw, 50px);
            line-height: 1.02;
            font-weight: 850;
            letter-spacing: -.045em;
        }

        .nv-hero-subtitle {
            color: #8d98a8 !important;
            font-size: 13px;
            line-height: 1.65;
            max-width: 780px;
            margin-top: 12px;
        }

        /* ====================================================================
           FOCUS / FILTER BANNER
           ==================================================================== */

        .nv-focus {
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: center;
            gap: 18px;
            background: linear-gradient(135deg, #0c1723, #0a1017);
            border: 1px solid rgba(77,156,255,.26);
            border-radius: 15px;
            padding: 16px 18px;
            margin-bottom: 24px;
        }

        .nv-focus-icon {
            width: 42px;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 11px;
            background: rgba(77,156,255,.10);
            border: 1px solid rgba(77,156,255,.18);
            font-size: 18px;
        }

        .nv-focus-kicker {
            color: #71b2ff !important;
            font-size: 9px;
            font-weight: 850;
            text-transform: uppercase;
            letter-spacing: .12em;
        }

        .nv-focus-main {
            color: #fff !important;
            font-size: 17px;
            font-weight: 800;
            margin-top: 3px;
        }

        .nv-focus-text {
            color: #778494 !important;
            font-size: 10px;
            line-height: 1.5;
            margin-top: 2px;
        }

        .nv-hard-filter {
            color: #77b7ff !important;
            border: 1px solid rgba(77,156,255,.18);
            background: rgba(77,156,255,.08);
            border-radius: 999px;
            padding: 6px 9px;
            font-size: 9px;
            font-weight: 800;
            white-space: nowrap;
        }

        /* ====================================================================
           SECTION HEADERS
           ==================================================================== */

        .nv-section {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
            margin: 28px 0 12px 0;
        }

        .nv-section-kicker {
            color: #687383 !important;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: .13em;
            font-weight: 850;
            margin-bottom: 3px;
        }

        .nv-section-title {
            color: #fff !important;
            font-size: 20px;
            font-weight: 820;
            letter-spacing: -.035em;
        }

        .nv-section-desc {
            color: #687383 !important;
            font-size: 10px;
            text-align: right;
        }

        /* ====================================================================
           STATUS CARDS
           ==================================================================== */

        .nv-status-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }

        .nv-status {
            min-height: 84px;
            background: linear-gradient(145deg, #0e1217, #0a0d11);
            border: 1px solid rgba(255,255,255,.075);
            border-radius: 14px;
            padding: 14px 15px;
        }

        .nv-status-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .nv-status-title {
            color: #687383 !important;
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: .10em;
        }

        .nv-status-value {
            color: #fff !important;
            font-size: 13px;
            font-weight: 750;
            margin-top: 9px;
        }

        .nv-status-ready {
            color: #55df9a !important;
        }

        .nv-status-missing {
            color: #f1c55d !important;
        }

        .nv-status-mark {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #32d583;
            box-shadow: 0 0 12px rgba(50,213,131,.55);
        }

        .nv-status-mark.warn {
            background: #f6c84c;
            box-shadow: 0 0 12px rgba(246,200,76,.4);
        }

        /* ====================================================================
           CONTROL PANEL
           ==================================================================== */

        .nv-panel {
            background: linear-gradient(145deg, #0d1117, #0a0d11);
            border: 1px solid rgba(255,255,255,.075);
            border-radius: 16px;
            padding: 19px;
        }

        .nv-panel-title {
            color: #fff !important;
            font-size: 13px;
            font-weight: 800;
            margin-bottom: 3px;
        }

        .nv-panel-subtitle {
            color: #687383 !important;
            font-size: 10px;
            margin-bottom: 14px;
        }

        /* ====================================================================
           CRITERIA CARDS
           ==================================================================== */

        .nv-criteria-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }

        .nv-criterion {
            background: #0c1015;
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 13px;
            padding: 14px 15px;
        }

        .nv-criterion-label {
            color: #697483 !important;
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: .10em;
        }

        .nv-criterion-value {
            color: #f5f7fb !important;
            font-size: 14px;
            font-weight: 750;
            margin-top: 8px;
        }

        /* ====================================================================
           ELIGIBILITY
           ==================================================================== */

        .nv-eligibility {
            background: linear-gradient(90deg, rgba(77,156,255,.085), rgba(77,156,255,.025));
            border: 1px solid rgba(77,156,255,.14);
            border-radius: 12px;
            padding: 13px 15px;
            color: #b9c8d9 !important;
            font-size: 11px;
            line-height: 1.55;
        }

        .nv-hard-rule {
            background: rgba(246,200,76,.08);
            border: 1px solid rgba(246,200,76,.13);
            border-radius: 12px;
            padding: 11px 15px;
            color: #d8c27b !important;
            font-size: 10px;
            margin-top: 8px;
        }

        /* ====================================================================
           LAUNCH CARD
           ==================================================================== */

        .nv-launch {
            position: relative;
            overflow: hidden;
            background:
                radial-gradient(circle at 95% 5%, rgba(77,156,255,.14), transparent 25%),
                linear-gradient(145deg, #0e131a, #090c10);
            border: 1px solid rgba(77,156,255,.16);
            border-radius: 17px;
            padding: 20px;
            margin-top: 18px;
        }

        .nv-launch-title {
            color: #fff !important;
            font-size: 17px;
            font-weight: 820;
        }

        .nv-launch-copy {
            color: #778392 !important;
            font-size: 10px;
            line-height: 1.55;
            margin: 5px 0 14px 0;
            max-width: 700px;
        }

        /* ====================================================================
           RESULTS
           ==================================================================== */

        .nv-result {
            background:
                radial-gradient(circle at 92% 0%, rgba(77,156,255,.12), transparent 25%),
                linear-gradient(145deg, #0e131a, #090c10);
            border: 1px solid rgba(255,255,255,.085);
            border-radius: 16px;
            padding: 19px 20px;
            margin: 20px 0 12px 0;
        }

        .nv-result-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
        }

        .nv-result-title {
            color: #fff !important;
            font-size: 18px;
            font-weight: 820;
        }

        .nv-result-subtitle {
            color: #687383 !important;
            font-size: 10px;
            margin-top: 4px;
        }

        .nv-run-pill {
            color: #70b2ff !important;
            border: 1px solid rgba(77,156,255,.18);
            background: rgba(77,156,255,.08);
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 9px;
            font-weight: 800;
            white-space: nowrap;
        }

        /* ====================================================================
           METRICS
           ==================================================================== */

        div[data-testid="stMetric"] {
            background: linear-gradient(145deg, #0e1218, #0a0d11);
            border: 1px solid rgba(255,255,255,.075);
            border-radius: 13px;
            padding: 14px 15px;
        }

        div[data-testid="stMetric"] label {
            color: #687383 !important;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: .09em;
            font-weight: 800;
        }

        div[data-testid="stMetric"] [data-testid="stMetricValue"] {
            color: #fff !important;
            font-weight: 820;
        }

        /* ====================================================================
           DATAFRAME
           ==================================================================== */

        div[data-testid="stDataFrame"] {
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 14px;
            overflow: hidden;
            background: #0b0e12;
        }

        /* ====================================================================
           EXPANDERS / ALERTS
           ==================================================================== */

        div[data-testid="stExpander"] {
            background: #0c1015;
            border: 1px solid rgba(255,255,255,.075);
            border-radius: 12px;
        }

        div[data-testid="stExpander"] summary {
            color: #f5f7fb !important;
            font-weight: 700;
        }

        div[data-testid="stAlert"] {
            border-radius: 11px;
        }

        div[data-testid="stAlert"] p {
            color: #eef2f7 !important;
        }

        /* ====================================================================
           LOGIN
           ==================================================================== */

        .nv-login-wrap {
            min-height: 78vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .nv-login {
            width: min(510px, 100%);
            background:
                radial-gradient(circle at 50% -15%, rgba(77,156,255,.12), transparent 34%),
                linear-gradient(145deg, #0e1218, #090c10);
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 20px;
            padding: 34px;
            box-shadow: 0 30px 80px rgba(0,0,0,.30);
        }

        .nv-login-logo {
            width: 250px;
            max-width: 88%;
            display: block;
            margin: 0 auto 27px auto;
        }

        .nv-login-title {
            color: #fff !important;
            text-align: center;
            font-size: 30px;
            line-height: 1.08;
            font-weight: 850;
            letter-spacing: -.04em;
        }

        .nv-login-subtitle {
            color: #778392 !important;
            text-align: center;
            font-size: 11px;
            line-height: 1.6;
            margin: 9px auto 24px auto;
            max-width: 360px;
        }

        .nv-login-foot {
            text-align: center;
            color: #515b67 !important;
            font-size: 9px;
            margin-top: 19px;
        }

        /* ====================================================================
           RESPONSIVE
           ==================================================================== */

        @media (max-width: 850px) {
            .nv-focus {
                grid-template-columns: auto 1fr;
            }

            .nv-hard-filter {
                display: none;
            }

            .nv-status-grid,
            .nv-criteria-grid {
                grid-template-columns: 1fr;
            }

            .nv-hero {
                padding: 28px 27px;
            }

            .nv-hero-title {
                font-size: 35px;
            }
        }

        </style>
        """
    ),
    unsafe_allow_html=True,
)


# ============================================================================
# DATABASE / ADMIN BOOTSTRAP
# ============================================================================

database.init_db()

admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
admin_password = os.getenv("ADMIN_PASSWORD", "")

if admin_email and admin_password:
    database.ensure_admin(admin_email, admin_password)

force_reset = os.getenv("ADMIN_FORCE_RESET", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}

if force_reset and admin_email and admin_password:
    try:
        database.reset_password(admin_email, admin_password)
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

    html(
        """
        <div class="nv-login-wrap">
            <div class="nv-login">
        """
    )

    if LOGO_URI:
        html(
            f"""
            <img class="nv-login-logo" src="{LOGO_URI}" alt="nVentures">
            """
        )
    else:
        html(
            """
            <div class="nv-login-title">nVentures</div>
            """
        )

    html(
        """
                <div class="nv-login-title">
                    Sourcing Intelligence
                </div>

                <div class="nv-login-subtitle">
                    Private AI-powered company discovery, research and
                    investment sourcing for the nVentures team.
                </div>
        """
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
            st.error("Invalid email or password.")

    html(
        """
                <div class="nv-login-foot">
                    nVentures Sourcing Platform
                </div>
            </div>
        </div>
        """
    )

    st.stop()


# ============================================================================
# CURRENT USER
# ============================================================================

user = st.session_state.user


# ============================================================================
# SIDEBAR
# ============================================================================

if LOGO_URI:
    html(
        f"""
        <div class="nv-brand">
            <img src="{LOGO_URI}" alt="nVentures">
        </div>
        """
    )
else:
    html(
        """
        <div class="nv-brand">
            <div class="nv-brand-fallback">nVentures</div>
        </div>
        """
    )

html('<div class="nv-sidebar-rule"></div>')

html(
    f"""
    <div class="nv-profile">
        <div class="nv-profile-label">Signed in as</div>
        <div class="nv-profile-email">{user["email"]}</div>
        <div class="nv-profile-role">{user["role"]}</div>
    </div>
    """
)

if st.sidebar.button("Sign out", use_container_width=True):
    st.session_state.user = None
    st.session_state.last_report = None
    st.session_state.last_run_id = None
    st.rerun()

st.sidebar.divider()

pages = ["Dashboard", "Run History"]

if user["role"] == "admin":
    pages.append("Admin")

page = st.sidebar.radio(
    "Navigate",
    pages,
)

html('<div class="nv-sidebar-spacer"></div>')

html(
    """
    <div class="nv-sidebar-credit">
        <div class="small">Built by</div>
        <div class="name">Pavara Kekulawala</div>
        <div class="product">nVentures Sourcing Platform</div>
    </div>
    """
)


# ============================================================================
# DASHBOARD
# ============================================================================

if page == "Dashboard":

    html(
        """
        <div class="nv-topbar">
            <div class="nv-breadcrumb">nVentures / Sourcing Intelligence</div>
            <div class="nv-live">
                <span class="nv-live-dot"></span>
                Platform ready
            </div>
        </div>

        <div class="nv-hero">
            <div class="nv-hero-eyebrow">Fund II • Sourcing Operations</div>
            <div class="nv-hero-title">Sourcing Intelligence</div>
            <div class="nv-hero-subtitle">
                AI-powered company discovery, research and investment sourcing.
                Discover qualified companies from the nVentures partner network,
                validate them against investment criteria, and push verified
                opportunities directly into Active Sourcing.
            </div>
        </div>
        """
    )

    html(
        f"""
        <div class="nv-focus">
            <div class="nv-focus-icon">🌐</div>

            <div>
                <div class="nv-focus-kicker">Geographic focus • hard filter</div>
                <div class="nv-focus-main">South Asia + Singapore</div>
                <div class="nv-focus-text">
                    {", ".join(ELIGIBLE_COUNTRIES)}
                </div>
            </div>

            <div class="nv-hard-filter">PYTHON ENFORCED</div>
        </div>
        """
    )

    # ------------------------------------------------------------------------
    # SYSTEM STATUS
    # ------------------------------------------------------------------------

    openrouter_ready = bool(
        os.getenv("OPENROUTER_API_KEY", "").strip()
    )

    tavily_ready = bool(
        os.getenv("TAVILY_API_KEY", "").strip()
    )

    google_ready = bool(
        os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    )

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">System health</div>
                <div class="nv-section-title">Connected services</div>
            </div>
            <div class="nv-section-desc">Pre-flight checks for the sourcing engine</div>
        </div>
        """
    )

    html(
        f"""
        <div class="nv-status-grid">

            <div class="nv-status">
                <div class="nv-status-top">
                    <div class="nv-status-title">Research AI</div>
                    <div class="nv-status-mark {" " if openrouter_ready else "warn"}"></div>
                </div>
                <div class="nv-status-value {"nv-status-ready" if openrouter_ready else "nv-status-missing"}">
                    {status_dot(openrouter_ready)}
                </div>
            </div>

            <div class="nv-status">
                <div class="nv-status-top">
                    <div class="nv-status-title">Web Research</div>
                    <div class="nv-status-mark {" " if tavily_ready else "warn"}"></div>
                </div>
                <div class="nv-status-value {"nv-status-ready" if tavily_ready else "nv-status-missing"}">
                    {status_dot(tavily_ready)}
                </div>
            </div>

            <div class="nv-status">
                <div class="nv-status-top">
                    <div class="nv-status-title">Google Sheets</div>
                    <div class="nv-status-mark {" " if google_ready else "warn"}"></div>
                </div>
                <div class="nv-status-value {"nv-status-ready" if google_ready else "nv-status-missing"}">
                    {"● Connected" if google_ready else "● Missing credentials"}
                </div>
            </div>

        </div>
        """
    )

    # ------------------------------------------------------------------------
    # RUN CONFIGURATION
    # ------------------------------------------------------------------------

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Operations</div>
                <div class="nv-section-title">Run configuration</div>
            </div>
            <div class="nv-section-desc">Tune the scope before launching research</div>
        </div>
        """
    )

    with st.container(border=True):
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

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Investment mandate</div>
                <div class="nv-section-title">Qualification criteria</div>
            </div>
            <div class="nv-section-desc">Hard constraints used by the sourcing workflow</div>
        </div>

        <div class="nv-criteria-grid">
            <div class="nv-criterion">
                <div class="nv-criterion-label">Business model</div>
                <div class="nv-criterion-value">B2B required</div>
            </div>

            <div class="nv-criterion">
                <div class="nv-criterion-label">Stage</div>
                <div class="nv-criterion-value">Pre-seed / Seed</div>
            </div>

            <div class="nv-criterion">
                <div class="nv-criterion-label">Funding ceiling</div>
                <div class="nv-criterion-value">${settings.max_total_funding:,.0f}</div>
            </div>
        </div>
        """
    )

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Eligibility</div>
                <div class="nv-section-title">Geographic rules</div>
            </div>
        </div>
        """
    )

    html(
        f"""
        <div class="nv-eligibility">
            <strong>Eligible headquarters:</strong>
            {", ".join(ELIGIBLE_COUNTRIES)}
        </div>

        <div class="nv-hard-rule">
            <strong>Hard Python-level filter:</strong>
            an AI response cannot override the geography rule.
        </div>
        """
    )

    # ------------------------------------------------------------------------
    # LAUNCH
    # ------------------------------------------------------------------------

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Execution</div>
                <div class="nv-section-title">Launch sourcing</div>
            </div>
        </div>

        <div class="nv-launch">
            <div class="nv-launch-title">Ready to source the next batch?</div>
            <div class="nv-launch-copy">
                The engine will research partner sources, discover candidates,
                validate investment and geography criteria, deduplicate against
                Active Sourcing, and write accepted companies to the configured sheet.
            </div>
        </div>
        """
    )

    start_run = st.button(
        "🚀  Start sourcing run",
        type="primary",
        use_container_width=True,
    )

    # ------------------------------------------------------------------------
    # RUN EXECUTION
    # ------------------------------------------------------------------------

    if start_run:

        if not openrouter_ready:
            st.error("OpenRouter API key is missing.")
            st.stop()

        if not tavily_ready:
            st.error("Tavily API key is missing.")
            st.stop()

        if not google_ready:
            st.error("Google service account credentials are missing.")
            st.stop()

        started = datetime.now(timezone.utc).isoformat()

        st.session_state.last_report = None
        st.session_state.last_run_id = None

        html(
            """
            <div class="nv-result">
                <div class="nv-result-top">
                    <div>
                        <div class="nv-result-title">Sourcing run in progress</div>
                        <div class="nv-result-subtitle">
                            Researching partner sources and validating candidates.
                        </div>
                    </div>
                    <div class="nv-run-pill">LIVE RUN</div>
                </div>
            </div>
            """
        )

        progress = st.progress(0)
        status = st.empty()

        try:
            status.info("Connecting to Google Sheets...")

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

            status.success("Google Sheets connected.")

            def on_progress(value, message=""):
                try:
                    progress.progress(
                        max(0, min(100, int(value)))
                    )
                except Exception:
                    pass

                if message:
                    status.write(message)

            status.info("Starting sourcing engine...")

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

                target_companies=int(target),
                max_partners=int(max_partners),
                max_deep_research=int(max_research),

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

            finished = datetime.now(timezone.utc).isoformat()

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

            accepted = report_list(report, "accepted")
            rejected = report_list(report, "rejected")
            duplicates = report_list(report, "duplicates")
            errors = report_list(report, "partner_errors")

            html(
                f"""
                <div class="nv-result">
                    <div class="nv-result-top">
                        <div>
                            <div class="nv-result-title">
                                Run #{run_id} complete
                            </div>
                            <div class="nv-result-subtitle">
                                Target: {int(target)} companies
                            </div>
                        </div>
                        <div class="nv-run-pill">COMPLETED</div>
                    </div>
                </div>
                """
            )

            a, b, c, d = st.columns(4)

            a.metric("Added", len(accepted))
            b.metric("Duplicates", len(duplicates))
            c.metric("Rejected", len(rejected))
            d.metric("Errors", len(errors))

            # ---------------------------------------------------------------
            # ACCEPTED
            # ---------------------------------------------------------------

            if accepted:
                html(
                    """
                    <div class="nv-section">
                        <div>
                            <div class="nv-section-kicker">Output</div>
                            <div class="nv-section-title">New companies</div>
                        </div>
                    </div>
                    """
                )

                accepted_details = report.get(
                    "accepted_details",
                    [],
                )

                if accepted_details:
                    display_data = []

                    for item in accepted_details:
                        if not isinstance(item, dict):
                            continue

                        display_data.append(
                            {
                                "Company": item.get("company", ""),
                                "Country": item.get("country", ""),
                                "Headquarters": item.get("headquarters", ""),
                                "Sector": item.get("sector", ""),
                                "Stage": item.get("stage", ""),
                                "Partner": item.get("partner", ""),
                                "Sheet row": item.get("row", ""),
                                "Fields": item.get("fields", ""),
                            }
                        )

                    if display_data:
                        st.dataframe(
                            pd.DataFrame(display_data),
                            use_container_width=True,
                            hide_index=True,
                        )
                    else:
                        st.write(accepted)
                else:
                    st.write(accepted)

            else:
                st.info("No new companies were accepted during this run.")

            # ---------------------------------------------------------------
            # OTHER RESULT GROUPS
            # ---------------------------------------------------------------

            if rejected:
                with st.expander(
                    f"Rejected candidates • {len(rejected)}"
                ):
                    st.write(rejected)

            if duplicates:
                with st.expander(
                    f"Duplicates skipped • {len(duplicates)}"
                ):
                    st.write(duplicates)

            if errors:
                with st.expander(
                    f"Partner/API errors • {len(errors)}"
                ):
                    st.write(errors)

            with st.expander("View full run report"):
                st.json(report)

        except Exception as exc:
            status.error("The sourcing run failed.")
            st.error("The sourcing run could not be completed.")
            st.exception(exc)


# ============================================================================
# RUN HISTORY
# ============================================================================

elif page == "Run History":

    html(
        """
        <div class="nv-topbar">
            <div class="nv-breadcrumb">nVentures / Operations</div>
            <div class="nv-live">
                <span class="nv-live-dot"></span>
                History available
            </div>
        </div>

        <div class="nv-hero">
            <div class="nv-hero-eyebrow">Operations</div>
            <div class="nv-hero-title">Run History</div>
            <div class="nv-hero-subtitle">
                Review previous sourcing runs, outcomes and full research reports.
            </div>
        </div>
        """
    )

    runs = database.list_runs(100)

    if not runs:
        st.info("No sourcing runs have been recorded yet.")
    else:
        df = pd.DataFrame(runs)

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
            col for col in display_cols if col in df.columns
        ]

        st.dataframe(
            df[available_cols],
            use_container_width=True,
            hide_index=True,
        )

        html(
            """
            <div class="nv-section">
                <div>
                    <div class="nv-section-kicker">Inspection</div>
                    <div class="nv-section-title">Open a run</div>
                </div>
            </div>
            """
        )

        run_ids = [
            safe_int(run["id"])
            for run in runs
            if "id" in run
        ]

        if run_ids:
            selected_run_id = st.selectbox(
                "Select a run",
                run_ids,
            )

            selected = database.get_run(
                int(selected_run_id)
            )

            if selected:
                html(
                    f"""
                    <div class="nv-result">
                        <div class="nv-result-top">
                            <div>
                                <div class="nv-result-title">
                                    Run #{selected["id"]}
                                </div>
                                <div class="nv-result-subtitle">
                                    {selected["user_email"]}
                                </div>
                            </div>
                            <div class="nv-run-pill">
                                {str(selected.get("status", "RECORDED")).upper()}
                            </div>
                        </div>
                    </div>
                    """
                )

                r1, r2, r3 = st.columns(3)

                with r1:
                    st.caption("Started")
                    st.write(selected["started_at"])

                with r2:
                    st.caption("Finished")
                    st.write(selected["finished_at"])

                with r3:
                    st.caption("Target")
                    st.write(selected["target"])

                try:
                    report = json.loads(
                        selected["report_json"]
                    )

                    accepted = report_list(report, "accepted")
                    duplicates = report_list(report, "duplicates")
                    rejected = report_list(report, "rejected")
                    errors = report_list(report, "partner_errors")

                    a, b, c, d = st.columns(4)

                    a.metric("Added", len(accepted))
                    b.metric("Duplicates", len(duplicates))
                    c.metric("Rejected", len(rejected))
                    d.metric("Errors", len(errors))

                    with st.expander(
                        "Full run report",
                        expanded=True,
                    ):
                        st.json(report)

                except Exception:
                    st.code(
                        selected["report_json"]
                    )


# ============================================================================
# ADMIN
# ============================================================================

elif page == "Admin":

    if user["role"] != "admin":
        st.error("Admin access required.")
        st.stop()

    html(
        """
        <div class="nv-topbar">
            <div class="nv-breadcrumb">nVentures / Administration</div>
            <div class="nv-live">
                <span class="nv-live-dot"></span>
                Admin access
            </div>
        </div>

        <div class="nv-hero">
            <div class="nv-hero-eyebrow">Administration</div>
            <div class="nv-hero-title">Team Administration</div>
            <div class="nv-hero-subtitle">
                Manage nVentures sourcing platform accounts and access.
            </div>
        </div>
        """
    )

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Access control</div>
                <div class="nv-section-title">Create team member</div>
            </div>
        </div>
        """
    )

    with st.form("new_user_form"):
        new_email = st.text_input(
            "Team member email"
        )

        new_password = st.text_input(
            "Temporary password",
            type="password",
        )

        new_role = st.selectbox(
            "Role",
            ["user", "admin"],
        )

        submitted = st.form_submit_button(
            "Create user",
            type="primary",
        )

        if submitted:
            if not new_email.strip():
                st.error("Email is required.")
            elif not new_password:
                st.error("Password is required.")
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

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Team</div>
                <div class="nv-section-title">Existing users</div>
            </div>
        </div>
        """
    )

    users = database.list_users()

    if users:
        st.dataframe(
            users,
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("No users found.")

    st.divider()

    html(
        """
        <div class="nv-section">
            <div>
                <div class="nv-section-kicker">Security</div>
                <div class="nv-section-title">Reset a team member password</div>
            </div>
        </div>
        """
    )

    with st.form("reset_password_form"):
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
                st.error("Email is required.")
            elif not reset_new_password:
                st.error("New password is required.")
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
