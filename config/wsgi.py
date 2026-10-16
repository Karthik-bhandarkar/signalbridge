"""
===================================================================================
SignalBridge Webhook Ingestion Engine — WSGI Gateway Interface
===================================================================================
PURPOSE:
    WSGI (Web Server Gateway Interface) is the standard specification (PEP 3333)
    describing how a Python web application communicates with a web server
    (such as Gunicorn, uWSGI, or Nginx).

HOW IT WORKS:
    1. An HTTP request reaches the server (e.g., Gunicorn in production or runserver in local).
    2. The server calls the Python object named 'application'.
    3. 'application' receives the raw HTTP request dictionary (environ) and returns
       the HTTP status and body back to the server to send to the client.
===================================================================================
"""
# Standard Library OS module for accessing environment variables
import os

# Django's WSGI application handler factory
from django.core.wsgi import get_wsgi_application

# Specify the default settings module if none is present in the environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

# The WSGI callable interface object that web servers invoke to handle HTTP requests
application = get_wsgi_application()

