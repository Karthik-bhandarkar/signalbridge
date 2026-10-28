from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('alerts', '0003_alert_content_hash_alert_external_id_alert_source_and_more'),
        ('webhooks', '0004_ingestedpayload_is_simulated'),
    ]

    operations = [
        migrations.AddField(
            model_name='incident',
            name='acknowledged_at',
            field=models.DateTimeField(blank=True, help_text='Timestamp when incident was acknowledged by an operator.', null=True),
        ),
        migrations.AddField(
            model_name='incident',
            name='resolved_at',
            field=models.DateTimeField(blank=True, help_text='Timestamp when incident was resolved by an operator.', null=True),
        ),
        migrations.AddField(
            model_name='incident',
            name='is_simulated',
            field=models.BooleanField(db_index=True, default=False, help_text='Flag indicating synthetic or simulator alert.'),
        ),
        migrations.AddField(
            model_name='incident',
            name='source_slug',
            field=models.CharField(blank=True, db_index=True, default='', help_text='Originating webhook source slug.', max_length=100),
        ),
        migrations.AddField(
            model_name='alert',
            name='is_simulated',
            field=models.BooleanField(db_index=True, default=False, help_text='Flag indicating synthetic or simulator alert.'),
        ),
    ]

