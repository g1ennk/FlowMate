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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReviewController")
class ReviewControllerTest {

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
    private static final LocalDate MONDAY = LocalDate.of(2026, 4, 20);

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

    private ReviewResponse sampleResponse() {
        return new ReviewResponse(
                "review-1", "WEEKLY", MONDAY, MONDAY.plusDays(6), "주간 회고 내용",
                Instant.parse("2026-04-20T10:00:00Z"),
                Instant.parse("2026-04-20T10:00:00Z"));
    }

    @Test
    @DisplayName("GET /{periodStart}?type: 단건 존재 시 200 + ReviewResponse JSON")
    void getReview_returns200_whenExists() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.getReview(eq(USER_ID), eq(ReviewType.WEEKLY), eq(MONDAY)))
                .thenReturn(sampleResponse());

        mockMvc.perform(get("/api/reviews/2026-04-20").param("type", "WEEKLY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("review-1"))
                .andExpect(jsonPath("$.content").value("주간 회고 내용"));
    }

    @Test
    @DisplayName("GET /{periodStart}?type: 미존재 시 404 Not Found")
    void getReview_returns404_whenNotExists() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.getReview(eq(USER_ID), eq(ReviewType.WEEKLY), eq(MONDAY)))
                .thenReturn(null);

        mockMvc.perform(get("/api/reviews/2026-04-20").param("type", "WEEKLY"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET ?type&from&to: 범위 조회 시 200 + ListResponse(items) JSON")
    void getReviews_rangeMode_returnsListResponse() throws Exception {
        LocalDate from = LocalDate.of(2026, 1, 1);
        LocalDate to = LocalDate.of(2026, 12, 31);
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.getReviews(eq(USER_ID), eq(ReviewType.WEEKLY), eq(from), eq(to)))
                .thenReturn(List.of(sampleResponse()));

        mockMvc.perform(get("/api/reviews")
                        .param("type", "WEEKLY")
                        .param("from", "2026-01-01")
                        .param("to", "2026-12-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items[0].id").value("review-1"));
    }

    @Test
    @DisplayName("PUT /api/reviews: upsert 성공 시 200 + ReviewResponse JSON")
    void upsertReview_returns200() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(reviewService.upsertReview(eq(USER_ID), any())).thenReturn(sampleResponse());

        String body = """
                {
                  "type": "WEEKLY",
                  "periodStart": "2026-04-20",
                  "periodEnd": "2026-04-27",
                  "content": "주간 회고 내용"
                }
                """;

        mockMvc.perform(put("/api/reviews")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("review-1"));
    }

    @Test
    @DisplayName("DELETE /api/reviews/{id}: service 위임 후 204 No Content")
    void deleteReview_returns204() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);

        mockMvc.perform(delete("/api/reviews/{id}", "review-1"))
                .andExpect(status().isNoContent());

        verify(reviewService).deleteReview(eq(USER_ID), eq("review-1"));
    }

    @Test
    @DisplayName("GET ?type=INVALID: 잘못된 타입은 400 BAD_REQUEST")
    void getReviews_invalidType_returns400() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);

        mockMvc.perform(get("/api/reviews")
                        .param("type", "INVALID_TYPE")
                        .param("from", "2026-01-01")
                        .param("to", "2026-12-31"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /{periodStart}?type=INVALID: 단건도 잘못된 타입은 400 BAD_REQUEST")
    void getReview_invalidType_returns400() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);

        mockMvc.perform(get("/api/reviews/2026-04-20").param("type", "INVALID_TYPE"))
                .andExpect(status().isBadRequest());
    }
}
