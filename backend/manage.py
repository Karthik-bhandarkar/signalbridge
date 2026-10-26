#!/usr/bin/env python
"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Management Script
===================================================================================
PURPOSE:
    This file is the primary command-line interface (CLI) entry point for the
    SignalBridge Django project. Whenever you execute commands like:
      - python manage.py runserver
      - python manage.py check
      - python manage.py makemigrations
      - python manage.py migrate
    this file is what Python executes first.

ARCHITECTURAL ROLE:
    In enterprise microservices and backend projects, manage.py acts as the bridge
    between the developer's terminal (or Docker entrypoint) and Django's internal
    management subsystems. It sets the active settings module and hands off control
    to Django's CLI parser.
===================================================================================
"""
# Standard Library Imports:
# 'os' provides an interface to the operating system (reading/writing environment variables).
import os

# 'sys' provides access to variables and functions that interact directly with the Python interpreter,
# such as sys.argv (the list of command-line arguments passed into the script).
import sys


def main():
    """
    Primary execution function for Django CLI administrative tasks.
    """
    # -----------------------------------------------------------------------------
    # 1. SET THE ACTIVE DJANGO SETTINGS MODULE
    # -----------------------------------------------------------------------------
    # 'DJANGO_SETTINGS_MODULE' tells Django where to find all project configurations
    # (databases, installed apps, middleware, caches, Celery settings, etc.).
    #
    # We use 'setdefault' so that if an external environment variable already exists
    # (for example, in production Docker containers: DJANGO_SETTINGS_MODULE=config.settings.production),
    # that value is preserved. If none is set, it defaults to our local developer
    # settings file located at: 'config/settings/local.py'.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

    # -----------------------------------------------------------------------------
    # 2. SAFELY IMPORT AND LAUNCH DJANGO'S COMMAND LINE DISPATCHER
    # -----------------------------------------------------------------------------
    try:
        # We import 'execute_from_command_line' dynamically inside main() so that
        # any environment configuration above is established before Django loads.
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        # If Django is not installed in the current Python environment (for example,
        # if run on the Windows host instead of inside the Docker container),
        # this helpful error message explains exactly why it failed.
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment or start the Docker container?\n"
            "Inside this project, run commands inside Docker using:\n"
            "  docker exec -it signalbridge_web python manage.py <command>"
        ) from exc

    # -----------------------------------------------------------------------------
    # 3. PASS COMMAND-LINE ARGUMENTS TO DJANGO'S DISPATCHER
    # -----------------------------------------------------------------------------
    # 'sys.argv' is a list of strings representing the command typed into the terminal.
    # Example: When you run 'python manage.py runserver 0.0.0.0:8000',
    #   sys.argv is ['manage.py', 'runserver', '0.0.0.0:8000'].
    # 'execute_from_command_line' inspects the argument, locates the matching Django
    # command class, and executes its logic.
    execute_from_command_line(sys.argv)


# ---------------------------------------------------------------------------------
# 4. PYTHON BOOTSTRAP GUARD
# ---------------------------------------------------------------------------------
# '__name__' is a special Python variable. When this script is run directly from
# the terminal (e.g., 'python manage.py ...'), Python assigns __name__ = '__main__'.
# This ensures main() runs ONLY when executed directly, never when imported as a library.
if __name__ == "__main__":
    main()

