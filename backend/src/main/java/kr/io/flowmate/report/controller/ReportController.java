package kr.io.flowmate.report.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.annotation.CurrentUser;
import kr.io.flowmate.report.dto.request.ReportQueryRequest;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@RequestMapping("/api/ai/report")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @PostMapping("/generate")
    public ResponseEntity<ReportResponse> generate(
        @CurrentUser String userId,
        @Valid @RequestBody ReportQueryRequest request
    ) {
        ReportResponse resp = reportService.generate(userId, request.getType(), request.getPeriodStart());
        return ResponseEntity.ok(resp);
    }

    @GetMapping
    public ResponseEntity<ReportResponse> findOne(
        @CurrentUser String userId,
        @Valid @ModelAttribute ReportQueryRequest request
    ) {
        Optional<ReportResponse> resp = reportService.findOne(userId, request.getType(), request.getPeriodStart());
        return resp.map(ResponseEntity::ok)
                   .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
