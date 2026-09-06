import os
import sqlite3
import secrets
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "pacefetch.db")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------

DEFAULT_ADMIN_PASSWORD = "Amadi1390@!#"

ADMIN_PASSWORD = os.getenv(
    "PACEFETCH_ADMIN_PASSWORD",
    DEFAULT_ADMIN_PASSWORD
)

ADMIN_TOKEN = os.getenv(
    "PACEFETCH_ADMIN_TOKEN",
    "pacefetch-local-admin-token"
)


# ---------------------------------------------------------
# DATABASE
# ---------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT DEFAULT 'Football',
            content TEXT DEFAULT '',
            image TEXT DEFAULT '',
            source TEXT DEFAULT 'PaceFetch',
            author TEXT DEFAULT 'PaceFetch',
            published_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            from_team TEXT DEFAULT '',
            to_team TEXT DEFAULT '',
            status TEXT DEFAULT 'Rumour',
            fee TEXT DEFAULT '',
            description TEXT DEFAULT '',
            published_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_name TEXT NOT NULL,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            prediction TEXT NOT NULL,
            confidence REAL DEFAULT 0,
            home_score INTEGER,
            away_score INTEGER,
            result TEXT DEFAULT 'pending',
            match_date TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS advertisers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            logo TEXT DEFAULT '',
            website TEXT DEFAULT '',
            banner TEXT DEFAULT '',
            title TEXT DEFAULT '',
            description TEXT DEFAULT '',
            cta TEXT DEFAULT 'Visit',
            start_date TEXT DEFAULT '',
            end_date TEXT DEFAULT '',
            status TEXT DEFAULT 'active',
            position TEXT DEFAULT 'carousel',
            priority INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            details TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
    """)

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def now_utc():
    return datetime.now(timezone.utc).isoformat()


def log_activity(action, details=""):
    conn = get_db()

    conn.execute(
        """
        INSERT INTO activity_logs
        (action, details, created_at)
        VALUES (?, ?, ?)
        """,
        (action, details, now_utc())
    )

    conn.commit()
    conn.close()


def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(row) for row in rows]


# ---------------------------------------------------------
# ADMIN AUTHENTICATION
# ---------------------------------------------------------

def require_admin():
    token = request.headers.get("X-PaceFetch-Admin-Token")

    if not token:
        return False

    return secrets.compare_digest(token, ADMIN_TOKEN)


def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):

        if not require_admin():
            return jsonify({
                "success": False,
                "error": "Unauthorized"
            }), 401

        return func(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "app": "PaceFetch",
        "status": "online",
        "time": now_utc()
    })


# ---------------------------------------------------------
# ADMIN LOGIN
# ---------------------------------------------------------

@app.route("/api/admin/login", methods=["POST"])
def admin_login():

    data = request.get_json(silent=True) or {}

    password = data.get("password", "")

    if not secrets.compare_digest(password, ADMIN_PASSWORD):
        return jsonify({
            "success": False,
            "error": "Invalid password"
        }), 401

    log_activity("Admin Login", "Successful administrator login")

    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": ADMIN_TOKEN
    })


# ---------------------------------------------------------
# NEWS API
# ---------------------------------------------------------

@app.route("/api/news", methods=["GET"])
def get_news():

    limit = request.args.get("limit", 20, type=int)

    if limit < 1:
        limit = 20

    if limit > 100:
        limit = 100

    conn = get_db()

    rows = conn.execute(
        """
        SELECT *
        FROM news
        ORDER BY published_at DESC
        LIMIT ?
        """,
        (limit,)
    ).fetchall()

    conn.close()

    return jsonify({
        "success": True,
        "count": len(rows),
        "news": rows_to_list(rows)
    })


@app.route("/api/news/<slug>", methods=["GET"])
def get_single_news(slug):

    conn = get_db()

    row = conn.execute(
        """
        SELECT *
        FROM news
        WHERE slug = ?
        """,
        (slug,)
    ).fetchone()

    conn.close()

    if not row:
        return jsonify({
            "success": False,
            "error": "News article not found"
        }), 404

    return jsonify({
        "success": True,
        "article": row_to_dict(row)
    })


@app.route("/api/admin/news", methods=["POST"])
@admin_required
def create_news():

    data = request.get_json(silent=True) or {}

    required = ["slug", "title"]

    for field in required:
        if not data.get(field):
            return jsonify({
                "success": False,
                "error": f"{field} is required"
            }), 400

    published_at = data.get("published_at") or now_utc()

    conn = get_db()

    try:
        cursor = conn.execute(
            """
            INSERT INTO news
            (
                slug,
                title,
                description,
                category,
                content,
                image,
                source,
                author,
                published_at,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["slug"],
                data["title"],
                data.get("description", ""),
                data.get("category", "Football"),
                data.get("content", ""),
                data.get("image", ""),
                data.get("source", "PaceFetch"),
                data.get("author", "PaceFetch"),
                published_at,
                now_utc()
            )
        )

        conn.commit()

        news_id = cursor.lastrowid

    except sqlite3.IntegrityError:
        conn.close()

        return jsonify({
            "success": False,
            "error": "A news article with this slug already exists"
        }), 409

    conn.close()

    log_activity(
        "News Created",
        f"News ID: {news_id}"
    )

    return jsonify({
        "success": True,
        "message": "News article created",
        "id": news_id
    }), 201


@app.route("/api/admin/news/<int:news_id>", methods=["PUT"])
@admin_required
def update_news(news_id):

    data = request.get_json(silent=True) or {}

    conn = get_db()

    existing = conn.execute(
        "SELECT * FROM news WHERE id = ?",
        (news_id,)
    ).fetchone()

    if not existing:
        conn.close()

        return jsonify({
            "success": False,
            "error": "News article not found"
        }), 404

    fields = [
        "slug",
        "title",
        "description",
        "category",
        "content",
        "image",
        "source",
        "author",
        "published_at"
    ]

    updates = []
    values = []

    for field in fields:

        if field in data:
            updates.append(f"{field} = ?")
            values.append(data[field])

    if not updates:
        conn.close()

        return jsonify({
            "success": False,
            "error": "No fields supplied for update"
        }), 400

    values.append(news_id)

    try:
        conn.execute(
            f"""
            UPDATE news
            SET {", ".join(updates)}
            WHERE id = ?
            """,
            values
        )

        conn.commit()

    except sqlite3.IntegrityError:
        conn.close()

        return jsonify({
            "success": False,
            "error": "That slug is already being used"
        }), 409

    conn.close()

    log_activity(
        "News Updated",
        f"News ID: {news_id}"
    )

    return jsonify({
        "success": True,
        "message": "News article updated"
    })


@app.route("/api/admin/news/<int:news_id>", methods=["DELETE"])
@admin_required
def delete_news(news_id):

    conn = get_db()

    cursor = conn.execute(
        "DELETE FROM news WHERE id = ?",
        (news_id,)
    )

    conn.commit()

    deleted = cursor.rowcount > 0

    conn.close()

    if not deleted:
        return jsonify({
            "success": False,
            "error": "News article not found"
        }), 404

    log_activity(
        "News Deleted",
        f"News ID: {news_id}"
    )

    return jsonify({
        "success": True,
        "message": "News article deleted"
    })


# ---------------------------------------------------------
# TRANSFERS API
# ---------------------------------------------------------

@app.route("/api/transfers", methods=["GET"])
def get_transfers():

    limit = request.args.get("limit", 20, type=int)

    if limit < 1:
        limit = 20

    if limit > 100:
        limit = 100

    conn = get_db()

    rows = conn.execute(
        """
        SELECT *
        FROM transfers
        ORDER BY published_at DESC
        LIMIT ?
        """,
        (limit,)
    ).fetchall()

    conn.close()

    return jsonify({
        "success": True,
        "count": len(rows),
        "transfers": rows_to_list(rows)
    })


@app.route("/api/admin/transfers", methods=["POST"])
@admin_required
def create_transfer():

    data = request.get_json(silent=True) or {}

    if not data.get("player"):
        return jsonify({
            "success": False,
            "error": "Player name is required"
        }), 400

    conn = get_db()

    cursor = conn.execute(
        """
        INSERT INTO transfers
        (
            player,
            from_team,
            to_team,
            status,
            fee,
            description,
            published_at,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["player"],
            data.get("from_team", ""),
            data.get("to_team", ""),
            data.get("status", "Rumour"),
            data.get("fee", ""),
            data.get("description", ""),
            data.get("published_at") or now_utc(),
            now_utc()
        )
    )

    conn.commit()

    transfer_id = cursor.lastrowid

    conn.close()

    log_activity(
        "Transfer Created",
        f"Transfer ID: {transfer_id}"
    )

    return jsonify({
        "success": True,
        "message": "Transfer created",
        "id": transfer_id
    }), 201


# ---------------------------------------------------------
# PREDICTIONS API
# ---------------------------------------------------------

@app.route("/api/predictions", methods=["GET"])
def get_predictions():

    date = request.args.get("date")
    limit = request.args.get("limit", 50, type=int)

    if limit < 1:
        limit = 50

    if limit > 200:
        limit = 200

    conn = get_db()

    if date:
        rows = conn.execute(
            """
            SELECT *
            FROM predictions
            WHERE match_date = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (date, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT *
            FROM predictions
            ORDER BY match_date DESC, id ASC
            LIMIT ?
            """,
            (limit,)
        ).fetchall()

    conn.close()

    return jsonify({
        "success": True,
        "count": len(rows),
        "predictions": rows_to_list(rows)
    })


@app.route("/api/admin/predictions", methods=["POST"])
@admin_required
def create_prediction():

    data = request.get_json(silent=True) or {}

    required = [
        "match_name",
        "home_team",
        "away_team",
        "prediction",
        "match_date"
    ]

    for field in required:
        if not data.get(field):
            return jsonify({
                "success": False,
                "error": f"{field} is required"
            }), 400

    confidence = data.get("confidence", 0)

    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0

    confidence = max(0, min(100, confidence))

    conn = get_db()

    cursor = conn.execute(
        """
        INSERT INTO predictions
        (
            match_name,
            home_team,
            away_team,
            prediction,
            confidence,
            home_score,
            away_score,
            result,
            match_date,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["match_name"],
            data["home_team"],
            data["away_team"],
            data["prediction"],
            confidence,
            data.get("home_score"),
            data.get("away_score"),
            data.get("result", "pending"),
            data["match_date"],
            now_utc()
        )
    )

    conn.commit()

    prediction_id = cursor.lastrowid

    conn.close()

    log_activity(
        "Prediction Created",
        f"Prediction ID: {prediction_id}"
    )

    return jsonify({
        "success": True,
        "message": "Prediction created",
        "id": prediction_id
    }), 201


@app.route("/api/admin/predictions/<int:prediction_id>", methods=["PUT"])
@admin_required
def update_prediction(prediction_id):

    data = request.get_json(silent=True) or {}

    allowed_fields = [
        "match_name",
        "home_team",
        "away_team",
        "prediction",
        "confidence",
        "home_score",
        "away_score",
        "result",
        "match_date"
    ]

    updates = []
    values = []

    for field in allowed_fields:

        if field in data:

            value = data[field]

            if field == "confidence":
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    value = 0

                value = max(0, min(100, value))

            updates.append(f"{field} = ?")
            values.append(value)

    if not updates:
        return jsonify({
            "success": False,
            "error": "No fields supplied for update"
        }), 400

    conn = get_db()

    existing = conn.execute(
        "SELECT id FROM predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()

    if not existing:
        conn.close()

        return jsonify({
            "success": False,
            "error": "Prediction not found"
        }), 404

    values.append(prediction_id)

    conn.execute(
        f"""
        UPDATE predictions
        SET {", ".join(updates)}
        WHERE id = ?
        """,
        values
    )

    conn.commit()
    conn.close()

    log_activity(
        "Prediction Updated",
        f"Prediction ID: {prediction_id}"
    )

    return jsonify({
        "success": True,
        "message": "Prediction updated"
    })


# ---------------------------------------------------------
# ADVERTISERS API
# ---------------------------------------------------------

@app.route("/api/advertisers", methods=["GET"])
def get_advertisers():

    conn = get_db()

    rows = conn.execute(
        """
        SELECT *
        FROM advertisers
        WHERE status = 'active'
        ORDER BY priority DESC, id ASC
        """
    ).fetchall()

    conn.close()

    return jsonify({
        "success": True,
        "count": len(rows),
        "advertisers": rows_to_list(rows)
    })


@app.route("/api/admin/advertisers", methods=["POST"])
@admin_required
def create_advertiser():

    data = request.get_json(silent=True) or {}

    if not data.get("company_name"):
        return jsonify({
            "success": False,
            "error": "Company name is required"
        }), 400

    conn = get_db()

    cursor = conn.execute(
        """
        INSERT INTO advertisers
        (
            company_name,
            logo,
            website,
            banner,
            title,
            description,
            cta,
            start_date,
            end_date,
            status,
            position,
            priority,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["company_name"],
            data.get("logo", ""),
            data.get("website", ""),
            data.get("banner", ""),
            data.get("title", ""),
            data.get("description", ""),
            data.get("cta", "Visit"),
            data.get("start_date", ""),
            data.get("end_date", ""),
            data.get("status", "active"),
            data.get("position", "carousel"),
            data.get("priority", 0),
            now_utc()
        )
    )

    conn.commit()

    advertiser_id = cursor.lastrowid

    conn.close()

    log_activity(
        "Advertiser Created",
        f"Advertiser ID: {advertiser_id}"
    )

    return jsonify({
        "success": True,
        "message": "Advertiser created",
        "id": advertiser_id
    }), 201


# ---------------------------------------------------------
# ADMIN OVERVIEW
# ---------------------------------------------------------

@app.route("/api/admin/overview", methods=["GET"])
@admin_required
def admin_overview():

    conn = get_db()

    news_count = conn.execute(
        "SELECT COUNT(*) FROM news"
    ).fetchone()[0]

    transfer_count = conn.execute(
        "SELECT COUNT(*) FROM transfers"
    ).fetchone()[0]

    prediction_count = conn.execute(
        "SELECT COUNT(*) FROM predictions"
    ).fetchone()[0]

    advertiser_count = conn.execute(
        "SELECT COUNT(*) FROM advertisers"
    ).fetchone()[0]

    conn.close()

    return jsonify({
        "success": True,
        "overview": {
            "news": news_count,
            "transfers": transfer_count,
            "predictions": prediction_count,
            "advertisers": advertiser_count
        }
    })


# -------
