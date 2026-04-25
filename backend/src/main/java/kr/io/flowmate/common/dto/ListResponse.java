package kr.io.flowmate.common.dto;

import java.util.List;

// 모든 도메인 List 응답에서 재사용하는 공통 Wrapper (items 필드 하나)
public record ListResponse<T>(List<T> items) {
}
