from django.apps import AppConfig


def auto_create_user_profile(sender, instance, created, **kwargs):
    if created:
        from apps.core.models import UserProfile, UserRole
        if instance.is_superuser:
            role = UserRole.ADMIN
        elif instance.is_staff:
            role = UserRole.OPERATOR
        else:
            role = UserRole.VIEWER
        UserProfile.objects.get_or_create(user=instance, defaults={"role": role})


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "Core Systems & DSA"

    def ready(self):
        from django.contrib.auth.models import User
        from django.db.models.signals import post_save

        post_save.connect(
            auto_create_user_profile,
            sender=User,
            dispatch_uid="auto_create_user_profile",
            weak=False,
        )

