from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webhooks', '0003_ingestedpayload_archive_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='ingestedpayload',
            name='is_simulated',
            field=models.BooleanField(db_index=True, default=False, help_text='Flag indicating synthetic or simulator payload.'),
        ),
    ]

