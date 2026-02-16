package kr.io.flowmate.settings.repository;

import kr.io.flowmate.settings.domain.UserSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettingsRepository extends JpaRepository<UserSettings, String> {
}
