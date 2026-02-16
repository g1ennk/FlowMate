package kr.io.flowmate.common.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

// 공통 리스트 응답 Wrapper로, 모든 도메인 List 응답 재사용 가능
@Getter
@AllArgsConstructor
public class ListResponse<T> {
    private List<T> items;
}
