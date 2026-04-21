package kr.io.flowmate.config;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) {
        http
                // CorsConfigurationSource @Bean 을 자동으로 집어 Security 필터 체인 내부에
                // CORS 처리를 꽂아 넣는다. OPTIONS preflight 가 인증 체크 전에 통과됨.
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm ->
                        sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                response.sendError(HttpServletResponse.SC_UNAUTHORIZED))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                response.sendError(HttpServletResponse.SC_FORBIDDEN))
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/auth/guest/token",
                                "/api/auth/*/authorize-url",
                                "/api/auth/*/exchange",
                                "/api/auth/refresh",
                                "/api/auth/logout",
                                "/api/timer/sse",
                                "/actuator/**"
                        ).permitAll()
                        .requestMatchers("/api/timer/state/**").hasRole("MEMBER")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // JWT 기반 stateless 인증이라 실제로 호출되지 않지만, 이 빈이 없으면
    // Spring Security 가 기본 user 와 자동 생성 비밀번호를 로그에 출력한다.
    // 호출될 일이 없으므로 어떤 username 이 들어와도 즉시 실패시킨다.
    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException(username);
        };
    }

}
