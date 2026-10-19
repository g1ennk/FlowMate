package kr.io.flowmate.settings.repository;

import jakarta.persistence.LockModeType;
import kr.io.flowmate.settings.domain.UserSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Optional;

public interface SettingsRepository extends JpaRepository<UserSettings, String> {

    /**
     * 설정 행이 없을 때만 기본값 행을 만들고, 이미 있으면 아무것도 바꾸지 않는다.
     * 같은 사용자의 동시 첫 저장은 PK의 행 락으로 직렬화되어 충돌 예외가 나지 않는다.
     * 기본값은 V1의 컬럼 DEFAULT를 쓴다 (UserSettings.createWithDefaults와 같은 값인지 SettingsConcurrencyIT가 확인).
     * INSERT IGNORE는 PK 충돌 외의 오류도 경고로 삼키므로 쓰지 않는다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO user_settings (user_id, created_at, updated_at)
            VALUES (:userId, :now, :now)
            ON DUPLICATE KEY UPDATE user_id = user_id
            """, nativeQuery = true)
    void insertDefaultsIfAbsent(String userId, Instant now);

    /**
     * insertDefaultsIfAbsent 직후 행을 읽는다. 다른 요청이 먼저 만든 행은 이 트랜잭션이 바꾼 행이 아니므로,
     * REPEATABLE READ 스냅샷과 상관없이 최신 행을 읽도록 잠금 읽기를 쓴다.
     * 행이 반드시 있는 상태라 gap lock 없이 이미 쥔 행 락만 다시 잡는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from UserSettings s where s.userId = :userId")
    Optional<UserSettings> findByIdForUpdate(String userId);
}
