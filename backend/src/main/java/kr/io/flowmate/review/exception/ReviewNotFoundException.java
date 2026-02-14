package kr.io.flowmate.review.exception;

import kr.io.flowmate.common.exception.NotFoundException;

public class ReviewNotFoundException extends NotFoundException {

    private final String reviewId;

    public ReviewNotFoundException(String reviewId) {
        super(String.format("Review를 찾을 수 없습니다. (id: %s)", reviewId));
        this.reviewId = reviewId;
    }

    public String getReviewId() {
        return reviewId;
    }

}
