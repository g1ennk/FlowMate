package kr.io.flowmate.review.controller;

import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.CurrentUserArgumentResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.review.service.ReviewService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReviewController")
class ReviewControllerTest {

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
    private static final LocalDate MONDAY = LocalDate.of(2026, 2, 16);

    @Mock private ReviewService reviewService;
    @Mock private CurrentUserResolver currentUserResolver;

    @InjectMocks private ReviewController reviewController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(reviewController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new CurrentUserArgumentResolver(currentUserResolver))
                .build();
    }

    @Test
    @DisplayName("GET ?type&periodStart: 단건 존재 시 200 + Review JSON")
    void getReviews_singleHit_returnsJson() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.getReview(USER_ID, ReviewType.DAILY, MONDAY))
                .thenReturn(new ReviewResponse(
                        "review-1", "daily", MONDAY, MONDAY, "내용",
                        Instant.parse("2026-02-16T10:00:00Z"),
                        Instant.parse("2026-02-16T10:00:00Z")));

        mockMvc.perform(get("/api/reviews")
                        .param("type", "daily")
                        .param("periodStart", "2026-02-16"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("review-1"))
                .andExpect(jsonPath("$.content").value("내용"));
    }

    @Test
    @DisplayName("GET ?type&periodStart: 미존재 시 200 + JSON literal 'null' (docs §6.1 공개 계약)")
    void getReviews_singleMiss_returnsJsonNull() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.getReview(USER_ID, ReviewType.DAILY, MONDAY)).thenReturn(null);

        mockMvc.perform(get("/api/reviews")
                        .param("type", "daily")
                        .param("periodStart", "2026-02-16"))
                .andExpect(status().isOk())
                .andExpect(content().string("null"));
    }

    @Test
    @DisplayName("GET ?type&from&to: 범위 결과를 ListResponse(items) 로 200")
    void getReviews_range_returnsListResponse() throws Exception {
        LocalDate from = LocalDate.of(2026, 2, 1);
        LocalDate to = LocalDate.of(2026, 2, 28);
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.getReviews(USER_ID, ReviewType.DAILY, from, to))
                .thenReturn(List.of(new ReviewResponse(
                        "r1", "daily", from, from, "1일",
                        Instant.parse("2026-02-01T00:00:00Z"),
                        Instant.parse("2026-02-01T00:00:00Z"))));

        mockMvc.perform(get("/api/reviews")
                        .param("type", "daily")
                        .param("from", "2026-02-01")
                        .param("to", "2026-02-28"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value("r1"));
    }

    @Test
    @DisplayName("GET: periodStart 와 from/to 를 함께 보내면 400 BAD_REQUEST (배타 검증)")
    void getReviews_bothModes_returns400() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);

        mockMvc.perform(get("/api/reviews")
                        .param("type", "daily")
                        .param("periodStart", "2026-02-16")
                        .param("from", "2026-02-01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    @DisplayName("GET: periodStart 와 from/to 가 모두 없으면 400 BAD_REQUEST (필수 검증)")
    void getReviews_neitherMode_returns400() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);

        mockMvc.perform(get("/api/reviews").param("type", "daily"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    @DisplayName("DELETE /api/reviews/{id}: service 위임 후 204 No Content")
    void deleteReview_returns204() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);

        mockMvc.perform(delete("/api/reviews/{id}", "review-1"))
                .andExpect(status().isNoContent());

        verify(reviewService).deleteReview(eq(USER_ID), eq("review-1"));
    }
}
