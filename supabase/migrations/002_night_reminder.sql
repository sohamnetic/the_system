-- Three reminders a day: morning, evening and night. The night one takes over the final warning.
alter table public.notification_prefs
  add column if not exists night text not null default '22:00',
  add column if not exists last_night_on text;
alter table public.notification_prefs alter column evening set default '18:00';
update public.notification_prefs set evening = '18:00' where evening = '21:00';
