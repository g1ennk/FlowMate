package kr.io.flowmate.review.repository;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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

}
