package kr.io.flowmate.common.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import kr.io.flowmate.config.JpaAuditingConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
@Import({BaseTimeEntityIT.TestConfig.class, JpaAuditingConfig.class})
class BaseTimeEntityIT {

    @Autowired
    DummyEntityRepository repo;

    @Test
    void auditingEntityListener_populatesCreatedAtAndUpdatedAt_onFlush() {
        DummyEntity e = new DummyEntity();
        e.id = "id-1";
        DummyEntity saved = repo.saveAndFlush(e);

        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Entity(name = "dummy_audit_it")
    static class DummyEntity extends BaseTimeEntity {
        @Id
        String id;
    }

    interface DummyEntityRepository extends JpaRepository<DummyEntity, String> {}

    @org.springframework.boot.test.context.TestConfiguration
    @EnableJpaRepositories(considerNestedRepositories = true,
            basePackageClasses = BaseTimeEntityIT.class)
    static class TestConfig {}
}
