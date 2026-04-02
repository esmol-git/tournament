-- Email опционален для учётных записей, созданных админом; при регистрации организации по-прежнему передаётся.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
