-- Additive MariaDB update; existing personnel data stays unchanged.
ALTER TABLE `Officer`
  ADD COLUMN IF NOT EXISTS `suspendedUntil` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `suspensionReason` TEXT NULL;
