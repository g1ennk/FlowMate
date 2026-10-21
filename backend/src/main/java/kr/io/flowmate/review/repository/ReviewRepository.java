package kr.io.flowmate.review.repository;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, String> {

    Optional<Review> findByUserIdAndTypeAndPeriodStart(String userId, ReviewType type, LocalDate periodStart);

    Optional<Review> findByIdAndUserId(String id, String userId);

    List<Review> findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(
            String userId,
            ReviewType type,
            LocalDate from,
            LocalDate to
    );

    /**
     * 같은 회고(user_id, type, period_start)의 최초 저장과 갱신을 한 문장으로 처리한다.
     * 같은 회고의 동시 최초 저장은 UNIQUE 인덱스의 행 락으로 직렬화되어, 나중 요청은 충돌 대신 갱신이 된다.
     * id와 created_at은 새 행일 때만 쓰인다. 엔티티를 거치지 않으므로 시각은 호출자가 바인딩한다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO reviews (id, user_id, type, period_start, period_end, content, created_at, updated_at)
            VALUES (:id, :userId, :type, :periodStart, :periodEnd, :content, :now, :now) AS incoming
            ON DUPLICATE KEY UPDATE
                period_end = incoming.period_end,
                content    = incoming.content,
                updated_at = incoming.updated_at
            """, nativeQuery = true)
    void upsert(String id, String userId, String type, LocalDate periodStart, LocalDate periodEnd,
                String content, Instant now);

}
