package kr.io.flowmate.auth.repository;

import kr.io.flowmate.auth.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, String> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /** 특정 사용자의 유효한(폐기되지 않고 미만료) 토큰 목록 */
    @Query("SELECT r FROM RefreshToken r WHERE r.userId = :userId AND r.revokedAt IS NULL AND r.expiresAt > :now")
    List<RefreshToken> findAllActiveByUserId(@Param("userId") String userId, @Param("now") Instant now);
}
